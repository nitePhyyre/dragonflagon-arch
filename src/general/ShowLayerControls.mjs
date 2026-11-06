import ARCHITECT from "../core/architect.mjs";
import SETTINGS from "../core/settings.mjs";

export default class ShowLayerControls {
	/**@readonly*/static PREF_WALLS = 'ShowLayerControls.WallsLayer';
	/**@readonly*/static PREF_LIGHT = 'ShowLayerControls.LightingLayer';
	/**@readonly*/static PREF_SOUND = 'ShowLayerControls.SoundsLayer';
	/**@readonly*/static _ready = false;
	/**
	 * Key of the toggle tool we add to each layer's control set. v13 changed SceneControl#tools
	 * from an array to a record, so this doubles as the tool's record key.
	 * @readonly
	 */
	static #TOOL = 'dfArchShowLayer';

	/**@type {boolean}*/
	static get showWalls() {
		return game.user.isGM && SETTINGS.get(ShowLayerControls.PREF_WALLS);
	}
	/**@type {boolean}*/
	static get showLights() {
		return game.user.isGM && SETTINGS.get(ShowLayerControls.PREF_LIGHT);
	}
	/**@type {boolean}*/
	static get showSounds() {
		return game.user.isGM && SETTINGS.get(ShowLayerControls.PREF_SOUND);
	}

	/**
	 * @param {string} layer
	 * @param {string} setting
	 * @param {boolean} toggled
	 */
	static async toggleLayer(layer, setting, toggled) {
		await SETTINGS.set(setting, toggled);
		const control = Object.values(ui.controls.controls).find(x => x.layer == layer);
		if (!control) return;
		if (toggled)
			control.icon += ' df-arch-layervisible';
		else if (control.icon.indexOf(' df-arch-layervisible') > 0)
			control.icon = control.icon.substring(0, control.icon.indexOf(' df-arch-layervisible'));
		setTimeout(() => ui.controls.render(), 100);
	}

	static init() {
		SETTINGS.register(this.PREF_WALLS, { config: false, scope: 'client', type: Boolean, default: false });
		SETTINGS.register(this.PREF_LIGHT, { config: false, scope: 'client', type: Boolean, default: false });
		SETTINGS.register(this.PREF_SOUND, { config: false, scope: 'client', type: Boolean, default: false });

		Hooks.on('getSceneControlButtons', (/**@type {Record<string, SceneControl>}*/controls) => {
			if (!game.user.isGM) return;

			/**
			 * @param {string} controlId  Record key of the SceneControl, which is also its name.
			 * @param {string} setting    Preference backing the toggle.
			 * @param {string} title      Localization path for the tool's tooltip.
			 * @param {boolean} shown     Whether the layer is currently kept visible.
			 */
			const addToggle = (controlId, setting, title, shown) => {
				const control = controls[controlId];
				// A control set is absent entirely if it is unavailable to this user.
				if (!control) return;
				if (shown) control.icon += ' df-arch-layervisible';
				control.tools ??= {};
				control.tools[ShowLayerControls.#TOOL] = {
					name: ShowLayerControls.#TOOL,
					// Tools sort by `order` ascending, so a negative value keeps this one on top
					// where the old array-based `unshift` put it.
					order: -1,
					icon: 'fas fa-eye',
					title,
					toggle: true,
					visible: true,
					active: SETTINGS.get(setting),
					// v13 renamed the tool callback from onClick(toggled) to onChange(event, active).
					onChange: (_event, active) => this.toggleLayer(controlId, setting, active)
				};
			};

			addToggle('walls', ShowLayerControls.PREF_WALLS, 'DF_ARCHITECT.ShowLayerControls.Walls', this.showWalls);
			addToggle('lighting', ShowLayerControls.PREF_LIGHT, 'DF_ARCHITECT.ShowLayerControls.Lights', this.showLights);
			addToggle('sounds', ShowLayerControls.PREF_SOUND, 'DF_ARCHITECT.ShowLayerControls.Sounds', this.showSounds);
		});

		Hooks.on('updateWall', () => this.#refreshAffectedLayers());
		Hooks.on('deleteWall', () => this.#refreshAffectedLayers());
	}

	/**
	 * Walls shape light and sound propagation, so a wall change has to re-draw the placeables of
	 * any layer we are keeping visible while it is inactive.
	 */
	static #refreshAffectedLayers() {
		if (!game.user.isGM) return;
		const refreshLayer = (/**@type {PlaceablesLayer}*/layer) => {
			layer._active = true;
			layer.objects.children.forEach(ShowLayerControls.redraw);
			layer._active = false;
		};
		if (this.showLights) refreshLayer(canvas.lighting);
		if (this.showSounds) refreshLayer(canvas.sounds);
	}

	/**
	 * Re-draw a placeable and leave its on-canvas control widget visible even though its layer is
	 * not the active one.
	 * @param {PlaceableObject} placeable
	 */
	static async redraw(placeable) {
		if (placeable instanceof AmbientSound)
			placeable.initializeSoundSource();
		else if (placeable instanceof AmbientLight)
			placeable.initializeLightSource();
		else {
			// v13 replaced Wall#updateSource with the edge-based Wall#initializeEdge.
			placeable.initializeEdge?.();
			placeable.renderFlags.set({ refresh: true });
			return;
		}
		await placeable.draw();
		placeable.applyRenderFlags();
		ShowLayerControls.showWidget(placeable);
	}

	/**
	 * Reveal whichever widget a placeable uses to show itself on its own layer. Lights lost their
	 * ControlIcon in v13 in favour of the AmbientLightShapeControls container (AmbientLight#controls);
	 * sounds still use a ControlIcon.
	 * @param {PlaceableObject} placeable
	 */
	static showWidget(placeable) {
		if (placeable.controls) placeable.controls.visible = true;
		if (placeable.controlIcon) placeable.controlIcon.visible = true;
	}

	static ready() {
		this._ready = true;
		const walls = this.showWalls;
		const light = this.showLights;
		const sound = this.showSounds;
		if (walls) { canvas.walls.activate(); canvas.walls.deactivate(); }
		if (light) { canvas.lighting.activate(); canvas.lighting.deactivate(); }
		if (sound) { canvas.sounds.activate(); canvas.sounds.deactivate(); }
		if (walls || light || sound)
			setTimeout(() => canvas.tokens.activate(), 1);

		if (!game.user.isGM) return;
		libWrapper.register(ARCHITECT.MOD_NAME, 'PlaceablesLayer.prototype.deactivate', this.PlaceablesLayer_deactivate, 'MIXED');
	}

	/**
	 * @this {PlaceablesLayer}
	 * @param {Function} wrapped
	 * @returns {PlaceablesLayer}
	 */
	static PlaceablesLayer_deactivate(wrapped) {
		if (!ShowLayerControls._ready) return wrapped();
		var toggled = false;
		switch (this.name) {
			case 'WallsLayer':
				toggled = ShowLayerControls.showWalls;
				break;
			case 'LightingLayer':
				toggled = ShowLayerControls.showLights;
				break;
			case 'SoundsLayer':
				toggled = ShowLayerControls.showSounds;
				break;
		}
		// If we are not on one of our layers, or we are not keeping the controls on
		if (!toggled) return wrapped();
		InteractionLayer.prototype.deactivate.bind(this)();
		this.objects.visible = true;
		if (this.preview) this.preview.removeChildren();

		if (this.name !== 'LightingLayer' && this.name !== 'SoundsLayer')
			return this;

		/**@type {PlaceableObject[]}*/(this.objects.children).forEach(async x => {
				await x.draw();
				x.applyRenderFlags();
				ShowLayerControls.showWidget(x);
			});
		return this;
	}
}
