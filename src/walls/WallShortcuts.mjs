import ARCHITECT from "../core/architect.mjs";
import libWrapperShared from "../core/libWrapperShared.mjs";


export default class WallShortcuts {
	/**@readonly*/static WALL_TYPES = new Set(['solid', 'terrain', 'invisible', 'ethereal', 'doors', 'secret', 'window']);

	static init() {
		// v13 turned the wall types from tools into palette presets and renamed the basic wall
		// from "walls" to "solid". Titles are taken from core so they stay localized.
		const wallTypes = [
			{ name: 'solid', title: 'CONTROLS.WallSolid' },
			{ name: 'terrain', title: 'CONTROLS.WallTerrain' },
			{ name: 'invisible', title: 'CONTROLS.WallInvisible' },
			{ name: 'ethereal', title: 'CONTROLS.WallEthereal' },
			{ name: 'doors', title: 'CONTROLS.WallDoor' },
			{ name: 'secret', title: 'CONTROLS.WallSecret' },
			{ name: 'window', title: 'CONTROLS.WallWindow' }
		];
		var counter = 0;
		for (let tool of wallTypes) {
			const currentTool = tool;
			game.keybindings.register(ARCHITECT.MOD_NAME, `WallShortcuts-${tool.name}`, {
				restricted: true,
				name: tool.title,
				hint: 'DF_ARCHITECT.WallShortcuts.Settings.Description',
				editable: [{ key: `Digit${++counter}`, modifiers: [KeyboardManager.MODIFIER_KEYS.SHIFT] }],
				onDown: () => {
					if (ui.controls.control?.name !== 'walls') return false;
					// SceneControls#_onClickTool is gone in v13+, and the preset handler reads the
					// tool name off the clicked element, so drive core's own delegated handler by
					// clicking the real button rather than synthesizing an event for it.
					if (!WallShortcuts.clickTool(currentTool.name)) return false;
					// Retype a wall that is mid-draw to match the newly chosen preset.
					const preview = canvas.walls.preview.children[0];
					const createData = ui.controls.control.tools?.[currentTool.name]?.createData;
					if ((preview instanceof Wall) && createData) preview.document.updateSource(createData);
					return true;
				}
			});
		}

		game.keybindings.register(ARCHITECT.MOD_NAME, 'WallShortcuts-ForceGridSnap', {
			restricted: true,
			name: 'DF_ARCHITECT.WallShortcuts.Settings.ToggleForceSnapName',
			hint: 'DF_ARCHITECT.WallShortcuts.Settings.ToggleForceSnapHint',
			editable: [{ key: 'F', modifiers: [] }],
			onDown: () => {
				if (!(canvas.activeLayer instanceof WallsLayer)) return;
				WallShortcuts.clickTool('snap');
			}
		});

		libWrapper.register(ARCHITECT.MOD_NAME, 'WallsLayer.prototype._onDragLeftStart', this.#patchForceSnap, 'WRAPPER');
		libWrapperShared.register('WallsLayer.prototype._onDragLeftDrop', this.#patchForceSnap);
	}

	/**
	 * Click one of the active control set's tool buttons, as though the user had.
	 * @param {string} name   Name of the tool, which is also its data-tool attribute.
	 * @returns {boolean}     Whether the button was found.
	 */
	static clickTool(name) {
		/**@type {HTMLElement|null|undefined}*/
		const button = ui.controls.element?.querySelector(`button.tool[data-tool="${name}"]`);
		button?.click();
		return !!button;
	}

	/**
	 * @param {Function} wrapper
	 * @param {*} event
	 * @returns {unknown}
	 */
	static #patchForceSnap(wrapper, event) {
		// v13 moved force-snap off the walls layer and onto the canvas as Canvas#forceSnapVertices.
		let forceSnap = canvas.forceSnapVertices;
		if (!forceSnap) return wrapper(event);
		// Pointer events are federated from v11 on, so modifier state is read off the event itself.
		if (event.shiftKey) canvas.forceSnapVertices = false;
		const result = wrapper(event);
		canvas.forceSnapVertices = forceSnap;
		return result;
	}
}
