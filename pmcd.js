#!/usr/bin/env node
'use strict'

/// Parse args

const {
	ArgumentParser
} = require('argparse')
const parser = new ArgumentParser({
	version: require('./package.json').version,
	addHelp: true,
	description: 'promiscuousd server'
})
parser.addArgument('name', {
	help: 'name of this service'
})
parser.addArgument(['-e', '--exec'], {
	help: 'Executes the given command',
	metavar: '<command>',
})
parser.addArgument(['-c', '--sh-exec'], {
	help: 'Executes the given command in shell',
	metavar: '<command>',
})
const argv = parser.parseArgs()
const has_exec = argv.exec != null
const has_sh_exec = argv.sh_exec != null
if (has_exec == has_sh_exec) {
	parser.error('must specify either -e or -c (but not both)')
}

const {
	make_advertisement,
	new_discover_node,
	is_ads_valid,
	describe_service,
} = require('./utils')

/// Set action

let on_connection_callback

if (has_exec) {
	const child_process = require('child_process')
	on_connection_callback = function (socket) {
		const _temp = argv.exec.split(/ +/)
		const program = _temp[0]
		const args = _temp.slice(1)
		const process = child_process.spawn(program, args)
		process.stdout.pipe(socket)
		socket.pipe(process.stdin)
		process.on('close', () => {
			socket.destroy()
		})
	}
} else {
	const execa = require('execa')
	on_connection_callback = function (socket) {
		const process = execa.shell(argv.sh_exec)
		process.stdout.pipe(socket)
		socket.pipe(process.stdin)
		process.then(() => {
			socket.destroy()
		})
	}
}

/// Create tcp server

const NetcatServer = require('netcat/server')
const nc = new NetcatServer().k().port(0).listen()
const debug_nc = require('debug')('pmc:netcat')
debug_nc.enabled = true

nc.on('ready', () => {
	const tcp_addr = nc.server.address()
	debug_nc(`Listening at ${tcp_addr.address}:${tcp_addr.port}`)
	setup_discovery(tcp_addr)
})
nc.on('connection', socket => {
	const remote_addr = socket.address()
	debug_nc(`Connection from ${remote_addr.address}:${remote_addr.port}`)
	on_connection_callback(socket)
})
nc.on('error', err => {
	throw err
	debug_nc('Error: %O', err)
})

/// Setup peer to peer node

function setup_discovery(tcp_addr) {
	const d = new_discover_node()
	const debug_d = require('debug')('pmc:discover')
	debug_d.enabled = true

	const ads = make_advertisement(argv.name, tcp_addr.port)
	d.advertise(ads)
	debug_d('%o service up', argv.name)

	// exit program if found older service with the same name
	d.on('added', node => {
		if (is_ads_valid(node.advertisement)) {
			const desc = describe_service(node)
			if (desc.name === ads.promiscuousd.name &&
				new Date(desc.createdAt) <= new Date(ads.promiscuousd.createdAt)) {
				debug_d('Error: name collision with %s:%d', desc.address, desc.port)
				process.exit(1)
			}
		}
	})

	d.on('error', err => {
		throw err
		debug_d('Error: %O', err)
	})
}