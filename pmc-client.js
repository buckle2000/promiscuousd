const {
	make_advertisement,
	new_discover_node,
	is_ads_valid,
	describe_service,
} = require('./utils')

/// Parse args

const {
	ArgumentParser
} = require('argparse')
const parser = new ArgumentParser({
	version: require('./package.json').version,
	addHelp: true,
	description: 'promiscuousd client',
	epilog: 'If neither -e nor -c is specified, stdin and stdout will be connected to the service',
})
parser.addArgument('name', {
	help: 'name of the service to connect'
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
if (has_exec && has_sh_exec) {
	parser.error('cannot specify both -e and -c')
}

/// Set action

let get_stdio

if (has_exec) {
	const child_process = require('child_process')
	get_stdio = function (close_cb) {
		const _temp = argv.exec.split(/ +/)
		const program = _temp[0]
		const args = _temp.slice(1)
		const process = child_process.spawn(program, args)
		process.on('close', () => {
			close_cb()
		})
		return {
			stdin: process.stdin,
			stdout: process.stdout,
		}
	}
} else if (has_sh_exec) {
	const execa = require('execa')
	get_stdio = function (close_cb) {
		const process = execa.shell(argv.sh_exec)
		process.then(() => {
			close_cb()
		})
		return {
			stdin: process.stdin,
			stdout: process.stdout,
		}
	}
} else {
	get_stdio = function (close_cb) {
		process.on('exit', () => {
			close_cb()
		})
		return {
			stdin: process.stdin,
			stdout: process.stdout,
		}
	}
}

/// Setup peer to peer node

const d = new_discover_node()
const debug_d = require('debug')('pmc:discover')
debug_d.enabled = true

debug_d('Searching for %o', argv.name)

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
				debug_d(`Found service`)
				piped = true

				const nc = new NetcatClient()
				const debug_nc = require('debug')('pmc:netcat')
				debug_nc.enabled = true

				// get io streams
				const {
					stdin,
					stdout
				} = get_stdio(() => nc.close())
				debug_nc(`Connecting to ${desc.address}:${desc.port}`)
				stdout.pipe(
					nc
						.addr(desc.address)
						.port(desc.port)
						.connect()
						.pipe(stdin).stream()
				)

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