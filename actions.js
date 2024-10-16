export function getActionDefinitions(self) {
	return {
		select_input: {
			name: 'Select Input',
			options: [
				{
					type: 'dropdown',
					label: 'Input Port',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
			],
			callback: (action) => {
				self.selectedInput = action.options.input

				self.checkFeedbacks()
			},
		},
		switch_output: {
			name: 'Switch Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output Port',
					id: 'output',
					default: '1',
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: (action) => {
				self.sendCommand(`s output ${action.options.output} in source ${self.selectedInput}!`)
				self.updateRoute(action.options.output, self.selectedInput)

				self.checkFeedbacks()
			},
		},
		input_output: {
			name: 'Input to Output',
			options: [
				{
					type: 'dropdown',
					label: 'Input Port',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
				{
					type: 'dropdown',
					label: 'Output Port',
					id: 'output',
					default: '1',
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: (action) => {
				self.sendCommand(`s output ${action.options.output} in source ${action.options.input}!`)
				self.updateRoute(action.options.output, action.options.input)

				self.checkFeedbacks()
			},
		},
		save_scene: {
			name: 'Save Scene',
			options: [
				{
					type: 'dropdown',
					label: 'Scene',
					id: 'scene',
					default: 1,
					choices: self.CHOICES_SCENES,
				},
			],
			callback: (action) => {
				self.sendCommand(`SceneSave ${action.options.scene}`)

				self.checkFeedbacks()
			},
		},
		recall_scene: {
			name: 'Recall Scene',
			options: [
				{
					type: 'dropdown',
					label: 'Scene',
					id: 'scene',
					default: 1,
					choices: self.CHOICES_SCENES,
				},
			],
			callback: (action) => {
				self.sendCommand(`SceneCall ${action.options.scene}`)

				self.checkFeedbacks()
			},
		},
		lock_keys: {
			name: 'Lock keys',
			options: [],
			callback: (action) => {
				self.sendCommand(`SetKeyLock 1`)
				self.updateLock(1)

				self.checkFeedbacks()
			},
		},
		unlock_keys: {
			name: 'Unlock keys',
			options: [],
			callback: (action) => {
				self.sendCommand(`SetKeyLock 0`)
				self.updateLock(0)

				self.checkFeedbacks()
			},
		},
		toggle_keylock: {
			name: 'Toggle keylock',
			options: [],
			callback: (action) => {
				self.sendCommand(`SetKeyLock ${ 1 - self.keylock }`)
				self.updateLock(1 - self.keylock)

				self.checkFeedbacks()
			},
		},
		enable_beep: {
			name: 'Enable key beep',
			options: [],
			callback: (action) => {
				self.sendCommand(`SetBeepEn 1`)
				self.updateLock(1)

				self.checkFeedbacks()
			},
		},
		disable_beep: {
			name: 'Disable key beep',
			options: [],
			callback: (action) => {
				self.sendCommand(`SetBeepEn 0`)
				self.updateLock(0)

				self.checkFeedbacks()
			},
		},
		toggle_beep: {
			name: 'Toggle key beep',
			options: [],
			callback: (action) => {
				self.sendCommand(`SetBeepEn ${ 1 - self.beepEn }`)

				self.updateBeepEn(1 - self.beepEn)
			},
		},
		beep: {
			name: 'Beep',
			options: [],
			callback: (action) => {
				self.sendCommand(`BeepONOnce`)
			},
		},
		all: {
			name: 'All outputs to selected input',
			options: [
				{
					type: 'checkbox',
					label: 'Use selected (or defined input)',
					id: 'selected',
					default: false,
				},
				{
					type: 'dropdown',
					label: 'Defined Input Port',
					id: 'input',
					default: '1',
					choices: self.CHOICES_INPUTS,
				},
			],
			callback: (action) => {
				let myInput = self.selectedInput
				if (!action.options.selected) {
					myInput = action.options.input
				}
				self.sendCommand(`SW ${myInput} ` + generateNumberString(self.CHOICES_OUTPUTS.length))
				for (let key in self.outputRoute) {
					self.updateRoute(key, myInput)
				}

				self.checkFeedbacks()
			},
		},
	}
}

function generateNumberString(n) {
	let result = ''

	for (let i = 1; i <= n; i++) {
		result += i + ' '
	}

	// Trim the trailing space
	result = result.trim()
	return result
}
