/// <reference path="../../fvtt-scripts/foundry.js" />
import SETTINGS from "../core/settings.mjs";


export default class WallChangeType {
	/**@readonly*/ static #META_KEY = 'WallChangeType.MetaKey';

	static ready() {
		SETTINGS.register(WallChangeType.#META_KEY, {
			name: 'DF_ARCHITECT.WallChangeType.Setting.MetaKeyName',
			hint: 'DF_ARCHITECT.WallChangeType.Setting.MetaKeyHint',
			config: true,
			scope: 'world',
			choices: {
				ctrl: 'DF_ARCHITECT.WallChangeType.Setting.MetaKey_OptionCtrl',
				alt: 'DF_ARCHITECT.WallChangeType.Setting.MetaKey_OptionAlt'
			},
			default: 'ctrl',
			type: String
		});

		Hooks.on('renderSceneControls', (/**@type {SceneControls}*/_app, /**@type {HTMLElement}*/element) => {
			// v13 removed SceneControls#_onClickTool and turned the wall types into palette presets
			// ("button" tools), so there is no longer a single method to wrap. Listen on the
			// controls element instead; its root survives part re-renders, so attach only once.
			if (element.dataset.dfArchChangeType) return;
			element.dataset.dfArchChangeType = 'true';
			element.addEventListener('click', WallChangeType.#onClickTool);
		});
	}

	/**
	 * Apply the clicked wall type to the currently selected walls when the configured modifier is
	 * held, alongside core's own handling of the click.
	 * @param {MouseEvent} event
	 */
	static async #onClickTool(event) {
		const button = /**@type {HTMLElement}*/(event.target).closest('button.tool[data-tool]');
		if (!button) return;
		if (ui.controls.control?.name !== 'walls') return;

		const metaKey = SETTINGS.get(WallChangeType.#META_KEY);
		if (metaKey === 'ctrl' && !event.ctrlKey) return;
		else if (metaKey === 'alt' && !event.altKey) return;

		// Only the wall presets carry wall data; select, snap and the palette toggle have none.
		// This replaces WallsLayer#_getWallDataFromActiveTool, which v13 removed.
		const tool = ui.controls.control.tools?.[button.dataset.tool];
		const wallData = foundry.utils.deepClone(tool?.createData);
		if (!wallData) return;

		if (wallData.door === undefined)
			wallData.door = 0;
		else if (wallData.ds === undefined)
			wallData.ds = 0;

		const controlled = canvas.walls.controlled;
		if (controlled.length === 0) return;
		if (controlled.length === 1) {
			await controlled[0].document.update(wallData);
			return;
		}
		const updateData = controlled.map(it => foundry.utils.mergeObject({ _id: it.document._id }, wallData));
		await canvas.scene.updateEmbeddedDocuments("Wall", updateData);
	}
}
