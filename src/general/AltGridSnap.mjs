/// <reference path="../../fvtt-scripts/foundry.js" />
/// <reference path="../global.d.ts" />
import ARCHITECT from "../core/architect.mjs";
import SETTINGS from "../core/settings.mjs";

export default class AltGridSnap {
	/**@readonly*/static PREF_ENABLED = 'AltGridSnap.Enabled';
	/**@readonly*/static PREF_TOGGLED = 'AltGridSnap.Toggled';
	/**@readonly*/static PREF_PLACE_ON_CONTROL_BAR = 'AltGridSnap.PlaceOnControlBar';
	/**
	 * DOM id of the toggle button we add to the layer bar. v13 rebuilt the scene controls as an
	 * ApplicationV2, so the bar is a <menu> of <button> elements rather than <ol#controls><li>.
	 * @readonly
	 */
	static #BUTTON_ID = 'df-arch-altSnap';

	static init() {
		SETTINGS.register(AltGridSnap.PREF_TOGGLED, {
			scope: 'client',
			config: false,
			type: Boolean,
			default: false,
			onChange: value => {
				if (SETTINGS.get(AltGridSnap.PREF_PLACE_ON_CONTROL_BAR)) {
					// Pressed state is carried by aria-pressed in v13+, not by an "active" class.
					const button = document.getElementById(AltGridSnap.#BUTTON_ID);
					button?.setAttribute('aria-pressed', value ? 'true' : 'false');
				} else {
					const tool = ui.controls.control?.tools?.altSnap;
					if (tool) tool.active = value;
					ui.controls.render();
				}
			}
		});
		SETTINGS.register(AltGridSnap.PREF_ENABLED, {
			scope: 'world',
			config: true,
			name: 'DF_ARCHITECT.AltGridSnap.Setting.EnabledName',
			hint: 'DF_ARCHITECT.AltGridSnap.Setting.EnabledHint',
			type: Boolean,
			default: false,
			onChange: () => { this.#_patchSquareGrid(); ui.controls.render({ reset: true }) }
		});
		SETTINGS.register(AltGridSnap.PREF_PLACE_ON_CONTROL_BAR, {
			scope: 'world',
			config: true,
			name: 'DF_ARCHITECT.AltGridSnap.Setting.PlaceOnControlBarName',
			hint: 'DF_ARCHITECT.AltGridSnap.Setting.PlaceOnControlBarHint',
			type: Boolean,
			default: false,
			onChange: () => { ui.controls.render({ reset: true, force: true }) }
		});

		game.keybindings.register(ARCHITECT.MOD_NAME, 'AltSnapGrid.Toggle', {
			restricted: true,
			name: 'DF_ARCHITECT.AltGridSnap.Hotkey_Toggle',
			editable: [{ key: 'KeyS', modifiers: [KeyboardManager.MODIFIER_KEYS.ALT] }],
			onDown: () => {
				if (this.enabled)
					this.toggled = !this.toggled;
				return this.enabled;
			}
		});

		if (this.enabled)
			this.#_patchSquareGrid();

		Hooks.on('getSceneControlButtons', (/**@type {Record<string, SceneControl>}*/ controls) => {
			if (!this.enabled) return;
			if (SETTINGS.get(AltGridSnap.PREF_PLACE_ON_CONTROL_BAR)) return;
			const isGM = game.user.isGM;
			const enabled = this.toggled;
			// v13: controls and their tools are records keyed by name and sorted by "order", and
			// the tool callback is onChange(event, active) rather than onClick(active).
			for (const control of Object.values(controls)) {
				control.tools ??= {};
				control.tools.altSnap = {
					icon: 'df df-alt-snap',
					name: 'altSnap',
					order: -2,
					title: 'DF_ARCHITECT.AltGridSnap.Label',
					visible: isGM,
					toggle: true,
					active: enabled,
					onChange: (_event, active) => this.toggled = active
				};
			}
		});
		Hooks.on('renderSceneControls',
			/**
			 * @param {SceneControls} _app
			 * @param {HTMLElement} element  From v13 this is the root element, not jQuery.
			 */
			(_app, element) => {
				if (!SETTINGS.get(AltGridSnap.PREF_PLACE_ON_CONTROL_BAR)) return;
				const menu = element.querySelector('[data-application-part="layers"] menu');
				if (!menu || menu.querySelector(`#${AltGridSnap.#BUTTON_ID}`)) return;
				const label = game.i18n.localize('DF_ARCHITECT.AltGridSnap.Label');
				const item = document.createElement('li');
				// Deliberately no data-action: core delegates clicks on [data-action] to its own
				// control/tool handlers, which would try to activate a layer that does not exist.
				item.innerHTML = `<button type="button" id="${AltGridSnap.#BUTTON_ID}"`
					+ ` class="control ui-control layer icon df df-alt-snap" data-tooltip="${label}"`
					+ ` aria-label="${label}" aria-pressed="${this.toggled}"></button>`;
				const button = item.firstElementChild;
				button.addEventListener('click', () => {
					const active = !this.toggled;
					this.toggled = active;
					button.setAttribute('aria-pressed', active ? 'true' : 'false');
				});
				menu.append(item);
			});
	}

	/**@type {boolean}*/
	static get enabled() {
		return SETTINGS.get(AltGridSnap.PREF_ENABLED);
	}
	/**@type {boolean}*/
	static get toggled() {
		return SETTINGS.get(AltGridSnap.PREF_TOGGLED);
	}
	static set toggled(value) {
		SETTINGS.set(AltGridSnap.PREF_TOGGLED, value);
	}

	static #_patchSquareGrid() {
		if (this.enabled)
			libWrapper.register(ARCHITECT.MOD_NAME, 'SquareGrid.prototype.getSnappedPoint', this.#_SquareGrid_getSnappedPoint, 'WRAPPER');
		else
			libWrapper.unregister(ARCHITECT.MOD_NAME, 'SquareGrid.prototype.getSnappedPoint');
	}

	/**
	 * @param {(...args: any) => any} wrapped
	 * @param {number} x
	 * @param {number} y
	 * @param {number|null} interval
	 * @returns { {x: number, y: number} }
	 */
	static #_SquareGrid_getSnappedPoint(wrapped, point, { mode, resolution = 1 }) {
		if (AltGridSnap.enabled && AltGridSnap.toggled) {
			const M = CONST.GRID_SNAPPING_MODES;
			let altGs = 0;
			if (mode & M.CENTER && (mode & M.VERTEX || mode & M.CORNER) && mode & M.SIDE_MIDPOINT)
				altGs = /**@type {Canvas}*/(canvas).dimensions.size / (4 * resolution);
			else
				altGs = /**@type {Canvas}*/(canvas).dimensions.size / (2 * resolution);
			const result = wrapped({ x: point.x - altGs, y: point.y - altGs }, { mode, resolution });
			return { x: result.x + altGs, y: result.y + altGs };
		}
		return wrapped(point, { mode, resolution });
	}
}
