const { Plugin, Notice, MetadataCache, PluginSettingTab, Setting } = require('obsidian');

// Simple debounce function to limit frequent calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Default settings
const DEFAULT_SETTINGS = {
    fileRegex: '[0-9]{4}\\-[0-9]{2}\\-[0-9]{2}', // Matches YYYY-MM-DD
    verbose: false, // Verbose logging off
    showNotice: true, // Show notice when changes made
    debounceDelay: 1000, // Debounce delay in ms
    propertyName: 'mentions', // Frontmatter property
    excludePatterns: [] // Files/folders to exclude
};

module.exports = class SiblingLinkerPlugin extends Plugin {
    settings = DEFAULT_SETTINGS;

    async onload() {
        console.log('Sibling Linker: Plugin loaded');
        
        // Load saved settings
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new SiblingLinkerSettingTab(this.app, this));

        // Debounced processVault to avoid excessive runs during rapid changes
        const debouncedProcessVault = debounce(async (file) => {
            if (this.settings.verbose) console.log('Sibling Linker: Vault change detected, running processVault for ' + file.path);
            const changesMade = await this.processVault(file);
            if (changesMade && this.settings.showNotice) {
                new Notice('Wikilink processing complete!');
            }
            if (this.settings.verbose) console.log('Sibling Linker: processVault completed');
        }, this.settings.debounceDelay);

        // Register vault modify event listener
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.extension === 'md') {
                    if (this.settings.verbose) console.log(`Sibling Linker: File modified: ${file.path}`);
                    debouncedProcessVault(file);
                }
            })
        );
        
        if (this.settings.verbose) console.log('Sibling Linker: Vault event listener registered');
    }

    async processVault(file = null) {
        let changesMade = false;
        const files = file ? [file] : this.app.vault.getMarkdownFiles();
        if (this.settings.verbose) console.log(`Sibling Linker: Starting processVault for ${file ? file.path : 'all files'}, processing ${files.length} files`);

        // Get regex
        let regex;
        try {
            regex = new RegExp(this.settings.fileRegex);
            if (this.settings.verbose) console.log(`Sibling Linker: Using regex: ${this.settings.fileRegex}`);
        } catch (e) {
            if (this.settings.verbose) console.log(`Sibling Linker: Invalid regex in settings: ${this.settings.fileRegex}, error: ${e.message}`);
            return false;
        }

        // Filter valid files
        const validFiles = files.filter(f => 
            regex.test(f.basename) && 
            !this.settings.excludePatterns.some(pattern => f.path.includes(pattern))
        );
        if (this.settings.verbose) console.log(`Sibling Linker: Found ${validFiles.length} valid files (matching regex and not excluded)`);

        for (const file of validFiles) {
            if (this.settings.verbose) console.log(`Sibling Linker: Processing file: ${file.path}`);
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // Find lines with multiple [[wikilinks]]
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const wikilinks = this.extractWikilinks(line);
                if (wikilinks.length > 1) {
                    if (this.settings.verbose) console.log(`Sibling Linker: Line ${i + 1} in ${file.path}: Found ${wikilinks.length} wikilinks: [${wikilinks.join(', ')}]`);
                    changesMade |= await this.addMentions(file, wikilinks);
                }
            }
        }

        if (this.settings.verbose) console.log(`Sibling Linker: Finished processing ${file ? file.path : 'all files'}`);
        return changesMade;
    }

    async scanFullVault() {
        if (this.settings.verbose) console.log('Sibling Linker: Manual full vault scan triggered');
        const changesMade = await this.processVault();
        if (changesMade && this.settings.showNotice) {
            new Notice('Full vault wikilink processing complete!');
        }
        if (this.settings.verbose) console.log('Sibling Linker: Full vault scan completed');
    }

    // Extract [[wikilinks]] from a line
    extractWikilinks(line) {
        const wikilinkRegex = /\[\[([^\]\|]+)(?:\|[^\]\|]+)?\]\]/g;
        const matches = [];
        let match;
        while ((match = wikilinkRegex.exec(line)) !== null) {
            matches.push(match[1]);
        }
        return matches;
    }

    // Add 'mentions' property to referenced notes
    async addMentions(sourceFile, wikilinks) {
        let changesMade = false;
        if (this.settings.verbose) console.log(`Sibling Linker: addMentions for ${sourceFile.path}, wikilinks: [${wikilinks.join(', ')}]`);
        for (let i = 0; i < wikilinks.length; i++) {
            const targetNote = wikilinks[i];
            const targetFile = this.app.metadataCache.getFirstLinkpathDest(targetNote, sourceFile.path);
            
            if (targetFile) {
                const otherMentions = wikilinks
                    .filter((_, index) => index !== i)
                    .map(link => `[[${link}]]`);

                if (otherMentions.length > 0) {
                    await this.app.fileManager.processFrontMatter(targetFile, frontmatter => {
                        if (!frontmatter[this.settings.propertyName]) {
                            frontmatter[this.settings.propertyName] = [];
                        } else if (typeof frontmatter[this.settings.propertyName] === 'string') {
                            frontmatter[this.settings.propertyName] = [frontmatter[this.settings.propertyName]];
                        }

                        otherMentions.forEach(mention => {
                            if (!frontmatter[this.settings.propertyName].includes(mention)) {
                                frontmatter[this.settings.propertyName].push(mention);
                                changesMade = true;
                                if (this.settings.verbose) console.log(`Sibling Linker: Added mention ${mention} to ${targetFile.path}`);
                            }
                        });
                    });
                }
            } else {
                if (this.settings.verbose) console.log(`Sibling Linker: No target file for [[${targetNote}]] from ${sourceFile.path}`);
            }
        }
        return changesMade;
    }

    // Load settings
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // Save settings
    async saveSettings() {
        await this.saveData(this.settings);
    }
};

// Settings tab
class SiblingLinkerSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Sibling Linker Settings' });

        new Setting(containerEl)
            .setName('File name regex')
            .setDesc('Regular expression to match file names (without extension). Default: [0-9]{4}\\-[0-9]{2}\\-[0-9]{2} (YYYY-MM-DD).')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.fileRegex)
                .setValue(this.plugin.settings.fileRegex)
                .onChange(async (value) => {
                    try {
                        new RegExp(value);
                        this.plugin.settings.fileRegex = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.settings.verbose) console.log(`Sibling Linker: Updated fileRegex to ${value}`);
                    } catch (e) {
                        new Notice(`Invalid regex: ${e.message}`);
                        if (this.plugin.settings.verbose) console.log(`Sibling Linker: Failed to update fileRegex: ${e.message}`);
                    }
                }));

        new Setting(containerEl)
            .setName('Verbose logging')
            .setDesc('Enable detailed console logs for debugging.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.verbose)
                .onChange(async (value) => {
                    this.plugin.settings.verbose = value;
                    await this.plugin.saveSettings();
                    if (value) console.log(`Sibling Linker: Verbose logging enabled`);
                }));

        new Setting(containerEl)
            .setName('Show processing notice')
            .setDesc('Display a notice when wikilink processing completes with changes.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showNotice)
                .onChange(async (value) => {
                    this.plugin.settings.showNotice = value;
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.verbose) console.log(`Sibling Linker: Show notice set to ${value}`);
                }));

        new Setting(containerEl)
            .setName('Debounce delay (ms)')
            .setDesc('Time to wait after a file change before processing (100-5000 ms).')
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.debounceDelay))
                .setValue(String(this.plugin.settings.debounceDelay))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 100 || num > 5000) {
                        new Notice('Debounce delay must be a number between 100 and 5000.');
                        return;
                    }
                    this.plugin.settings.debounceDelay = num;
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.verbose) console.log(`Sibling Linker: Updated debounceDelay to ${num}`);
                }));

        new Setting(containerEl)
            .setName('Frontmatter property name')
            .setDesc('Name of the property to store wikilink mentions (e.g., mentions, related). Use letters, numbers, underscores, or hyphens.')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.propertyName)
                .setValue(this.plugin.settings.propertyName)
                .onChange(async (value) => {
                    if (value.trim() && !/[^a-zA-Z0-9_-]/.test(value)) {
                        this.plugin.settings.propertyName = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.settings.verbose) console.log(`Sibling Linker: Updated propertyName to ${value}`);
                    } else {
                        new Notice('Invalid property name: Use letters, numbers, underscores, or hyphens.');
                    }
                }));

        new Setting(containerEl)
            .setName('Exclude files or folders')
            .setDesc('Paths to exclude from processing (one per line, e.g., Templates/, Archive/).')
            .addTextArea(text => text
                .setPlaceholder('Templates/\nArchive/')
                .setValue(this.plugin.settings.excludePatterns.join('\n'))
                .onChange(async (value) => {
                    const patterns = value.split('\n').map(p => p.trim()).filter(p => p);
                    this.plugin.settings.excludePatterns = patterns;
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.verbose) console.log(`Sibling Linker: Updated excludePatterns to [${patterns.join(', ')}]`);
                }));

        new Setting(containerEl)
            .setName('Scan entire vault')
            .setDesc('Manually process all matching files to link sibling wikilinks.')
            .addButton(button => button
                .setButtonText('Scan Now')
                .setCta()
                .onClick(async () => {
                    await this.plugin.scanFullVault();
                }));
    }
}