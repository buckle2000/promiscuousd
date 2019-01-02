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

function pipe_to_each_other(process, socket) {
	process.stdout.pipe(socket)
	socket.pipe(process.stdin)
	process.then(() => {
		socket.destroy()
	}).catch(err => {
		throw err
	})
}

let on_connection_callback

const execa = require('execa')

if (has_exec) {
	on_connection_callback = function (socket) {
		const _temp = argv.exec.split(/ +/)
		const program = _temp[0]
		const args = _temp.slice(1)
		const process = execa(program, args, {
			reject: false
		})
		pipe_to_each_other(process, socket)
	}
} else {
	on_connection_callback = function (socket) {
		const process = execa.shell(argv.sh_exec, {
			reject: false
		})
		pipe_to_each_other(process, socket)
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
	debug_nc(`Connection from ${socket.remoteAddress}:${socket.remotePort}`)
	on_connection_callback(socket)
	socket.on('error', err => {
		throw err
	})
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