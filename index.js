import { InstanceBase, InstanceStatus, TCPHelper, runEntrypoint } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getPresetDefinitions } from './presets.js'
import { getConfigFields } from './config.js'

class MTVikiMatrixInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.CHOICES_INPUTS = [
			{ id: '1', label: 'IN1' },
			{ id: '2', label: 'IN2' },
			{ id: '3', label: 'IN3' },
			{ id: '4', label: 'IN4' },
			{ id: '5', label: 'IN5' },
			{ id: '6', label: 'IN6' },
			{ id: '7', label: 'IN7' },
			{ id: '8', label: 'IN8' },
		]
		this.CHOICES_OUTPUTS = [
			{ id: '1', label: 'OUT1' },
			{ id: '2', label: 'OUT2' },
			{ id: '3', label: 'OUT3' },
			{ id: '4', label: 'OUT4' },
			{ id: '5', label: 'OUT5' },
			{ id: '6', label: 'OUT6' },
			{ id: '7', label: 'OUT7' },
			{ id: '8', label: 'OUT8' },
		]
		this.CHOICES_SCENES = []
		for (let i=1; i<=16; i++) {
			this.CHOICES_SCENES.push({ id: i, label: `Scene ${i}` })
		}
		this.pollMixerTimer = undefined
		this.selectedInput = 1
		this.outputRoute = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8 }
		this.keylock = 0
		this.beepEn = 0
	}

	getConfigFields() {
		return getConfigFields()
	}

	async destroy() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.pollMixerTimer) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}
	}

	async init(config) {
		await this.configUpdated(config)
	}

	async configUpdated(config) {
		this.config = config

		this.config.polling_interval = this.config.polling_interval ?? 60000
		this.config.port = this.config.port ?? 23

		switch (this.config.matrix_size) {
			case '2x2':
				this.inputs = 2
				this.outputs = 2
				break
			case '4x2':
				this.inputs = 4
				this.outputs = 2
				break
			case '4x4':
				this.inputs = 4
				this.outputs = 4
				break
			case '16x16':
				this.inputs = 16
				this.outputs = 16
				break
			case '8x8':
			default:
				this.inputs = 8
				this.outputs = 8
				break
		}
		this.CHOICES_INPUTS = []
		for (let i = 1; i <= this.inputs; i++) {
			this.CHOICES_INPUTS[i - 1] = { id: i.toString(), label: 'IN' + i }
		}

		this.CHOICES_OUTPUTS = []
		for (let i = 1; i <= this.outputs; i++) {
			this.CHOICES_OUTPUTS[i - 1] = { id: i.toString(), label: 'OUT' + i }
		}

		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setPresetDefinitions(getPresetDefinitions(this))
		this.initVariables()

		this.initTcpSocket()
		this.initPolling()
	}

	initTcpSocket() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new TCPHelper(this.config.host, this.config.port, {
				reconnect_interval: 10000,
				reconnect: true,
			})
			this.socket._socket.setNoDelay(true)

			this.updateStatus(InstanceStatus.Connecting)

			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})

			this.socket.on('error', (err) => {
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				this.log('info', 'Connected')
				this.sendCommand('r status!')      //poll current matrix status once upon connect
				this.sendCommand('r lock!') //poll current keylock status once upon connect
				this.sendCommand('r beep!')  //poll current beepEn status
			})

			let receiveBacklog = ''
			this.socket.on('data', (receivebuffer) => {
				receiveBacklog += receivebuffer
				let n = receiveBacklog.indexOf('\n')
				while (~n) {
					this.processResponse(receiveBacklog.substring(0, n))
					receiveBacklog = receiveBacklog.substring(n + 1)
					n = receiveBacklog.indexOf('\n')
				}
			})
		}
	}

	processResponse(receivebuffer) {
		if (this.config.log_responses) {
			this.log('debug', 'Response: ' + receivebuffer)
		}

		let responses = receivebuffer.toString('utf8').split(/[\r\n]+/)
		for (let response of responses) {
			if (response.length > 0) {
				let tokens = response.split(' ')
				if (this.config.log_tokens) {
					console.log('Tokens: ' + tokens)
				}
				/*
				SWS 1 2 3 4 5 6 7 8
				MCUVer 01.00.00
				TitleLable xxxxx
				ServiceType xxxxx
				ServiceNum xxxx
				InPortEdid xxxx yyyy
				KeyLockStatus x
				IP 1.2.3.4
				IPMask 255.255.255.0
				InPortHDCPS 1 0 1 1
				OutPortHDCPS 1 0 1 1
				SetEDIDData OK
				EDIDData x x x x
				*/
				switch (tokens[0]) {
					case 'power': //'SWS'
						for (let i = 1; i < tokens.length; i++) {
							this.updateRoute(i, tokens[i])
						}
						break
					case 'panel': //'KeyLockStatus'
						this.updateLock(tokens[3]) //was '1'
						break
					case 'beep': //'BeepEn'
						this.updateBeepEn(tokens[1])
						break
				}
				this.checkFeedbacks()
			}
		}
	}

	sendCommand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(cmd + '\r\n').catch((e) => {
					this.log('debug', `Send failed: ${e?.message ?? e}`)
				})
			} else {
				this.log('debug', 'Socket not connected :(')
			}
		}
	}

	initPolling() {
		// poll to pick up switch state from possible changes from controls on the unit
		// changes usually come spontaneously, polling is just a backup mechanism
		if (this.pollMixerTimer) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}

		if (this.config.polled_data) {
			this.pollMixerTimer = setInterval(() => {
				this.sendCommand('r status!') //'GetSW'
				this.sendCommand('r lock!') //'GetKeyLock'
			}, this.config.poll_interval)
		}
	}

	updateVariableValues() {
		// This is not the most efficient to always update everything, but we have so few it isnt a problem
		const variableValues = {}

		for (const input of this.CHOICES_INPUTS) {
			let list = ''
			for (let key in this.outputRoute) {
				if (this.outputRoute[key] == input.id) {
					list += key
				}
			}
			variableValues[`input_route${input.id}`] = list
		}

		for (const output of this.CHOICES_OUTPUTS) {
			variableValues[`output_route${output.id}`] = this.outputRoute[output.id]
		}

		this.setVariableValues(variableValues)
	}

	updateRoute(output, input) {
		if (!this.socket.isConnected) return

		if (output == 0) {
			//all outputs
			this.CHOICES_OUTPUTS.forEach((item) => {
				this.outputRoute[item.id] = input
			})
		} else {
			this.outputRoute[output] = input
		}

		this.updateVariableValues()
	}

	updateBeepEn(state) {
		if (!this.socket.isConnected) return

		if (state == 0) {
			this.beepEn = 'off' //was 0
		} else if (state == 1) {
			this.beepEn = 'on' //was 1
		} else {
			this.log('warn', 'updateBeepEn called with invalid state value')
		}
	}

	updateLock(state) {
		if (!this.socket.isConnected) return

		if (state == 0) {
			this.keylock = 'off' //was 0
		} else if (state == 1) {
			this.keylock = 'on' //was 1
		} else {
			this.log('warn', 'updateLock called with invalid state value')
		}
	}

	initVariables() {
		let variableDefinitions = []
		this.CHOICES_INPUTS.forEach((item) => {
			variableDefinitions.push({
				variableId: `input_route${item.id}`,
				name: `Input ${item.id}`,
			})
		})
		this.CHOICES_OUTPUTS.forEach((item) => {
			variableDefinitions.push({
				variableId: `output_route${item.id}`,
				name: `Output ${item.id}`,
			})
		})
		this.setVariableDefinitions(variableDefinitions)

		this.updateVariableValues()
	}
}

runEntrypoint(MTVikiMatrixInstance, [])
