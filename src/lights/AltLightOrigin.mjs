/// <reference path="../../fvtt-scripts/foundry.js" />
import ARCHITECT from "../core/architect.mjs";
import SETTINGS from "../core/settings.mjs";


export default class AltLightOrigin {
	/**@readonly*/static #LIGHTING_LAYER = 'lighting';
	/**@readonly*/static #KEYEVENT_UP = 'keyup';
	/**@readonly*/static #KEYEVENT_DOWN = 'keydown';
	/**@readonly*/static PREF_COLOUR1 = 'AltLightOrigin.Colour1';
	/**@readonly*/static PREF_COLOUR2 = 'AltLightOrigin.Colour2';
	/**
	 * Name of the PIXI.Graphics child we attach to every AmbientLight to draw the origin
	 * crosshairs. v13 replaced the light's ControlIcon with an AmbientLightShapeControls widget
	 * (AmbientLight#controls), so the crosshairs can no longer be drawn by substituting the icon.
	 * They are drawn into a sibling graphic instead, leaving core's own draw path untouched.
	 * @readonly
	 */
	static #GRAPHIC = 'dfArchOriginCrosshair';
	static #showCrosshairs = false;
	static get showCrosshairs() { return this.#showCrosshairs; }
	static #alternateColour = false;
	static get alternateColour() { return this.#alternateColour; }
	/**
	 * Bound once so it can actually be removed again; `bind` returns a fresh function on every
	 * call, so the previous implementation's removeEventListener calls were no-ops.
	 * @type {(event: KeyboardEvent) => void}
	 */
	static #keyEventHandler = AltLightOrigin.#_keyEventHandler.bind(AltLightOrigin);

	static init() {
		libWrapper.register(ARCHITECT.MOD_NAME, 'AmbientLight.prototype._draw', async function (wrapped, ...args) {
			await wrapped(...args);
			this[AltLightOrigin.#GRAPHIC] = this.addChild(new PIXI.Graphics());
			this[AltLightOrigin.#GRAPHIC].eventMode = 'none';
			AltLightOrigin.#refresh(this);
		}, 'WRAPPER');
		// _refreshState resets the shape controls' visibility every refresh, so the crosshair
		// override has to be re-applied after core has had its say.
		libWrapper.register(ARCHITECT.MOD_NAME, 'AmbientLight.prototype._refreshState', function (wrapped, ...args) {
			wrapped(...args);
			AltLightOrigin.#refresh(this);
		}, 'WRAPPER');
	}

	/**
	 * Draw or clear the origin crosshairs for a single light.
	 * @param {AmbientLight} light
	 */
	static #refresh(light) {
		/**@type {PIXI.Graphics}*/
		const graphic = light[AltLightOrigin.#GRAPHIC];
		if (!graphic || graphic.destroyed) return;
		const show = AltLightOrigin.#showCrosshairs && !!light.layer?.active;
		graphic.visible = show;
		// While the crosshairs are up they stand in for the light's shape widget, exactly as they
		// used to stand in for its control icon.
		if (light.controls) light.controls.visible = !show;
		if (!show) return;

		const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
		const half = size * 0.5;
		const colourPref = AltLightOrigin.#alternateColour ? AltLightOrigin.PREF_COLOUR2 : AltLightOrigin.PREF_COLOUR1;
		let colour = AltLightOrigin.#parseColour(SETTINGS.get(colourPref));
		if (isNaN(colour)) colour = AltLightOrigin.#parseColour(SETTINGS.default(colourPref));

		graphic.clear()
			.lineStyle(1, colour, 1.0)
			.moveTo(-half, -half).lineTo(half, half)
			.moveTo(half, -half).lineTo(-half, half)
			.lineStyle(2, colour, 1.0)
			.drawEllipse(0, 0, half, half);
	}

	static ready() {
		// @ts-ignore
		new window.Ardittristan.ColorSetting(ARCHITECT.MOD_NAME, AltLightOrigin.PREF_COLOUR1, {
			name: "DF_ARCHITECT.AltLightOrigin.Settings.Colour1_Name",
			hint: "DF_ARCHITECT.AltLightOrigin.Settings.Colour1_Hint",
			label: "DF_ARCHITECT.AltLightOrigin.Settings.Colour1_Name",
			restricted: true,
			defaultColor: "#ffffffff",
			scope: "world",
		});
		// @ts-ignore
		new window.Ardittristan.ColorSetting(ARCHITECT.MOD_NAME, AltLightOrigin.PREF_COLOUR2, {
			name: "DF_ARCHITECT.AltLightOrigin.Settings.Colour2_Name",
			hint: "DF_ARCHITECT.AltLightOrigin.Settings.Colour2_Hint",
			label: "DF_ARCHITECT.AltLightOrigin.Settings.Colour2_Name",
			restricted: true,
			defaultColor: "#ff5500ff",
			scope: "world",
		});

		Hooks.on('renderSceneControls', (/**@type {SceneControls}*/controls) => {
			// v13 made SceneControls an ApplicationV2; `control` is the active SceneControl object.
			if (controls.control?.name === AltLightOrigin.#LIGHTING_LAYER) {
				window.addEventListener(AltLightOrigin.#KEYEVENT_DOWN, AltLightOrigin.#keyEventHandler);
				window.addEventListener(AltLightOrigin.#KEYEVENT_UP, AltLightOrigin.#keyEventHandler);
			}
			else {
				window.removeEventListener(AltLightOrigin.#KEYEVENT_DOWN, AltLightOrigin.#keyEventHandler);
				window.removeEventListener(AltLightOrigin.#KEYEVENT_UP, AltLightOrigin.#keyEventHandler);
				if (AltLightOrigin.#showCrosshairs) {
					AltLightOrigin.#showCrosshairs = false;
					AltLightOrigin.#refreshAll();
				}
			}
		});
	}

	/**@param {KeyboardEvent} event*/
	static #_keyEventHandler(event) {
		if (event.repeat
			|| (event.code !== 'ShiftLeft'
				&& event.code !== 'ShiftRight'
				&& event.code !== 'AltLeft'
				&& event.code !== 'AltRight')) return;
		if (this.#showCrosshairs === event.shiftKey && this.#alternateColour === event.altKey) return;
		this.#showCrosshairs = event.shiftKey;
		this.#alternateColour = event.altKey;
		this.#refreshAll();
	}

	static #refreshAll() {
		if (!canvas?.ready) return;
		for (const light of canvas.lighting.placeables) AltLightOrigin.#refresh(light);
	}

	/**
	 * @param {string} colorStr
	 * @returns {number}
	 */
	static #parseColour(colorStr) {
		if (colorStr.startsWith('#')) colorStr = colorStr.substr(1);
		if (colorStr.length === 8) colorStr = colorStr.substr(0, 6);
		return parseInt('0x' + colorStr);
	}
}
