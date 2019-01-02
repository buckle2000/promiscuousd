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
	help: 'Executes the given command.',
	metavar: '<command>',
})
parser.addArgument(['-c', '--sh-exec'], {
	help: 'Executes the given command in shell.',
	metavar: '<command>',
})
parser.addArgument(['--pty'], {
	help: 'Use pseudo-terminal. Use with -e.',
	action: 'storeTrue'
})

const argv = parser.parseArgs()
const has_exec = argv.exec != null
const has_sh_exec = argv.sh_exec != null

if (has_exec == has_sh_exec) {
	parser.error('must specify either -e or -c (but not both)')
}


/// Setup

const debug = require('debug')('pmc')
debug.enabled = true

function require_optional(package_name) {
	try {
		return require(package_name)
	} catch (e) {
		debug(e)
		debug(`Please install package 'package_name'. It is marked as optional but it isn't for your use case.`)
		process.exit(1)
	}
}

const {
	make_advertisement,
	new_discover_node,
	is_ads_valid,
	describe_service,
} = require('./utils')

/// Set action

function pipe_to_each_other_and_die_together(process, socket) {
	process.stdout.pipe(socket)
	socket.pipe(process.stdin)
	process.then(() => {
		socket.destroy()
	}).catch(err => {
		throw err
	})
}

let on_connection_callback

if (has_exec) {
	const split_argv_string = require('arrgv')
	const _temp = split_argv_string(argv.exec)
	const program = _temp[0]
	const args = _temp.slice(1)

	if (argv.pty) {
		// -e --pty
		const PTY = require_optional('@buckle2000/pty.js')

		debug('Warning: --pty is experimental')

		on_connection_callback = function (socket) {
			const p = PTY.spawn(program, args, {})
			debug('Spawned process %o in pseudo-terminal', argv.exec)
			p.stdout.pipe(socket)
			socket.pipe(p.stdin)
			p.on('close', () => {
				socket.destroy()
			})
			p.on('error', err => {
				debug('Error: %O', err)
			})
		}
	} else {
		// -e
		const execa = require_optional('execa')
		on_connection_callback = function (socket) {
			const p = execa(program, args, {
				reject: false
			})
			pipe_to_each_other_and_die_together(p, socket)
		}
	}
} else {
	// -c
	const execa = require_optional('execa')
	on_connection_callback = function (socket) {
		const p = execa.shell(argv.sh_exec, {
			reject: false
		})
		pipe_to_each_other_and_die_together(p, socket)
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

	const ads = make_advertisement(argv.name, tcp_addr.port, argv.pty)
	d.advertise(ads)
	debug_d('%o service up', argv.name)

	// exit program if found older service with the same name
	d.on('added', node => {
		if (is_ads_valid(node.advertisement)) {
			const desc = describe_service(node)
			if (desc.name === ads.promiscuousd.name &&
				new Date(desc.created_at) <= new Date(ads.promiscuousd.created_at)) {
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