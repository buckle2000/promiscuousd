#!/usr/bin/env node
'use strict'

/// Parse args

const {
	ArgumentParser
} = require('argparse')
const parser = new ArgumentParser({
	version: require('./package.json').version,
	addHelp: true,
	description: 'promiscuousd client',
})
parser.addArgument('name', {
	help: 'name of the service to connect'
})
parser.addArgument(['-t', '--timeout'], {
	help: 'exit program if the service is not found in this much time (defaults to 5)',
	metavar: '<seconds>',
	defaultValue: 5,
})
const argv = parser.parseArgs()


const {
	make_advertisement,
	new_discover_node,
	is_ads_valid,
	describe_service,
} = require('./utils')

/// Setup peer to peer node

const d = new_discover_node()
const debug_d = require('debug')('pmc:discover')
// debug_d.enabled = true

debug_d('Searching for %o', argv.name)

const timeout_handle = setTimeout(() => {
	console.error('Timed out (maybe increase timeout with --timeout?')
	process.exit(1)
}, argv.timeout * 1000);

// if found service, connect tcp to process

const NetcatClient = require('netcat/client')

let piped = false

d.on('added', node => {
	if (is_ads_valid(node.advertisement)) {
		const desc = describe_service(node)
		if (desc.name === argv.name) {
			if (piped) {
				debug_d(`Already connected, ignoring service at ${desc.address}:${desc.port}`)
				debug_d(`Warning: this should not happen`)
			} else {
				clearTimeout(timeout_handle)
				debug_d(`Found service`)
				piped = true
				d.stop()

				const nc = new NetcatClient()
				const debug_nc = require('debug')('pmc:netcat')
				// debug_nc.enabled = true

				debug_nc(`Connecting to ${desc.address}:${desc.port}`)
				process.stdin.pipe(
					nc
						.addr(desc.address)
						.port(desc.port)
						.connect()
						.pipe(process.stdout).stream()
				)

				nc.on('close', () => {
					process.exit()
				})
				nc.on('error', err => {
					throw err
					debug_nc('Error: %O', err)
				})
			}
		}
	}
})

d.on('error', err => {
	throw err
	debug_d('Error: %O', err)
})