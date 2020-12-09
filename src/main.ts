import * as Handlebars from 'handlebars';
import { AbstractTextComponent, App, FileSystemAdapter, FuzzyMatch, fuzzySearch, FuzzySuggestModal, MarkdownSourceView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, PreparedQuery, prepareQuery, Setting, SuggestModal, TextComponent, TFile } from 'obsidian';
import { InsertCitationModal } from './modals';

import { CitationsPluginSettings, CitationsSettingTab } from './settings';
import { Entry, EntryData } from './types';


export default class MyPlugin extends Plugin {
	settings: CitationsPluginSettings;
	library: {[id: string]: Entry} = {};

	private literatureNoteTitleTemplate: HandlebarsTemplateDelegate;
	private literatureNotePathTemplate: HandlebarsTemplateDelegate;
	private literatureNoteContentTemplate: HandlebarsTemplateDelegate;

	get editor(): CodeMirror.Editor {
		let view = this.app.workspace.activeLeaf.view;
		if (!(view instanceof MarkdownView))
			return null;

		let sourceView = view.sourceMode;
		return (sourceView as MarkdownSourceView).cmEditor;
	}

	async loadSettings() {
		this.settings = new CitationsPluginSettings();

		const loadedSettings = await this.loadData();
		if (!loadedSettings)
			return;

		if ("citationExportPath" in loadedSettings)
			this.settings.citationExportPath = loadedSettings.citationExportPath;
	}

	async saveSettings() {
		this.saveData(this.settings);
	}

	onload() {
		this.loadSettings().then(() => this.init());
	}

	init() {
		// Load library export
		if (this.settings.citationExportPath) {
			FileSystemAdapter.readLocalFile(this.settings.citationExportPath).then(buffer => this.onLibraryUpdate(buffer))
		} else {
			console.warn("Citations plugin: citation export path is not set. Please update plugin settings.");
		}

		// TODO subscribe to library updates

		// Pre-compile templating functions
		this.literatureNoteTitleTemplate = Handlebars.compile(this.settings.literatureNoteTitleTemplate);
		this.literatureNotePathTemplate = Handlebars.compile(this.settings.literatureNotePathTemplate);
		this.literatureNoteContentTemplate = Handlebars.compile(this.settings.literatureNoteContentTemplate);

		this.addCommand({
			id: "insert-citation",
			name: "Insert citation",
			checkCallback: (checking: boolean) => {
				if (!checking) {
					let modal = new InsertCitationModal(this.app, this);
					modal.open();
				}
			}
		})

		this.addRibbonIcon("dice", "Sample Plugin", () => {
			new InsertCitationModal(this.app, this).open();
		})

		this.addSettingTab(new CitationsSettingTab(this.app, this));
	}

	onLibraryUpdate(libraryBuffer: ArrayBuffer) {
		// Decode file as UTF-8
		var dataView = new DataView(libraryBuffer);
		var decoder = new TextDecoder("utf8");
		const value = decoder.decode(dataView);

		let libraryArray = JSON.parse(value);
		// Index by citekey
		this.library = Object.fromEntries(libraryArray.map((entryData: EntryData) => [entryData.id, new Entry(entryData)]));
	}

	onunload() {
		console.log('unloading plugin');
	}

	getTitleForCitekey(citekey: string): string {
		let entry = this.library[citekey];
		return this.literatureNoteTitleTemplate({
			citekey: citekey,
			authors: entry.authors,
			authorString: entry.authorString,
			year: entry.year
		});
	}

	getPathForCitekey(citekey: string): string {
		let title = this.getTitleForCitekey(citekey);
		return this.literatureNotePathTemplate({noteTitle: title});
	}

	getInitialContentForCitekey(citekey: string): string {
		let entry = this.library[citekey];
		return this.literatureNoteContentTemplate({
			citekey: citekey,
			authors: entry.authors,
			authorString: entry.authorString,
			year: entry.year
		});
	}

	async getOrCreateLiteratureNoteFile(citekey: string): Promise<TFile> {
		let path = this.getPathForCitekey(citekey),
				file = this.app.vault.getAbstractFileByPath(path);

		if (file == null)
			file = await this.app.vault.create(path, "");

		return file as TFile;
	}

	async openLiteratureNote(citekey: string, newPane: boolean): Promise<void> {
		this.getOrCreateLiteratureNoteFile(citekey).then((file: TFile) => {
			this.app.workspace.getLeaf(newPane).openFile(file);
		});
	}

	async insertLiteratureNoteLink(citekey: string) {
		this.getOrCreateLiteratureNoteFile(citekey).then(file => {
			// TODO what is the API for this?
			console.log(this.app.workspace.activeLeaf);

			let title = this.getTitleForCitekey(citekey),
				  linkText = `[[${title}]]`;
			// console.log(this.app.metadataCache.fileToLinktext(file, this.app.vault.getRoot().path, true))
			this.editor.replaceRange(linkText, this.editor.getCursor());
		})
	}
}
