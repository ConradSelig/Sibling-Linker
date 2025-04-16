const { Plugin, Notice, MetadataCache } = require('obsidian');

// Toggle verbose logging
const VERBOSE = false;

// Simple debounce function to limit frequent calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

module.exports = class SiblingLinkerPlugin extends Plugin {
    async onload() {
        console.log('Sibling Linker: Plugin loaded');
        
        // Debounced processVault to avoid excessive runs during rapid changes
        const debouncedProcessVault = debounce(async () => {
            if (VERBOSE) console.log('Sibling Linker: Vault change detected, running processVault');
            const changesMade = await this.processVault();
            if (changesMade) {
                if (VERBOSE) new Notice('Wikilink processing complete!');
            }
            if (VERBOSE) console.log('Sibling Linker: processVault completed');
        }, 1000); // Wait 1 second after last change

        // Register vault modify event listener
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.extension === 'md') {
                    if (VERBOSE) console.log(`Sibling Linker: File modified: ${file.path}`);
                    debouncedProcessVault();
                }
            })
        );
        
        if (VERBOSE) console.log('Sibling Linker: Vault event listener registered');
    }

    async processVault() {
        let changesMade = false;
        if (VERBOSE) console.log('Sibling Linker: Starting processVault');
        const files = this.app.vault.getMarkdownFiles();
        if (VERBOSE) console.log(`Sibling Linker: Found ${files.length} Markdown files`);

        // Step 1: Filter files with YYYY-MM-DD format
        const validFiles = files.filter(file => /[0-9]{4}\-[0-9]{2}\-[0-9]{2}/.test(file.basename));
        if (VERBOSE) console.log(`Sibling Linker: Found ${validFiles.length} valid files (matching YYYY-MM-DD)`);

        for (const file of validFiles) {
            if (VERBOSE) console.log(`Sibling Linker: Processing file: ${file.path}`);
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // Step 2: Find lines with multiple [[wikilinks]]
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const wikilinks = this.extractWikilinks(line);
                if (wikilinks.length > 1) {
                    if (VERBOSE) console.log(`Sibling Linker: Line ${i + 1} in ${file.path}: Found ${wikilinks.length} wikilinks: [${wikilinks.join(', ')}]`);
                    changesMade |= await this.addMentions(file, wikilinks);
                }
            }
        }
        if (VERBOSE) console.log('Sibling Linker: Finished processing all files');
        return changesMade;
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
        if (VERBOSE) console.log(`Sibling Linker: addMentions for ${sourceFile.path}, wikilinks: [${wikilinks.join(', ')}]`);
        for (let i = 0; i < wikilinks.length; i++) {
            const targetNote = wikilinks[i];
            const targetFile = this.app.metadataCache.getFirstLinkpathDest(targetNote, sourceFile.path);
            
            if (targetFile) {
                const otherMentions = wikilinks
                    .filter((_, index) => index !== i)
                    .map(link => `[[${link}]]`);

                if (otherMentions.length > 0) {
                    await this.app.fileManager.processFrontMatter(targetFile, frontmatter => {
                        if (!frontmatter.mentions) {
                            frontmatter.mentions = [];
                        } else if (typeof frontmatter.mentions === 'string') {
                            frontmatter.mentions = [frontmatter.mentions];
                        }

                        otherMentions.forEach(mention => {
                            if (!frontmatter.mentions.includes(mention)) {
                                frontmatter.mentions.push(mention);
                                changesMade = true;
                                if (VERBOSE) console.log(`Sibling Linker: Added mention ${mention} to ${targetFile.path}`);
                            }
                        });
                    });
                }
            } else {
                if (VERBOSE) console.log(`Sibling Linker: No target file for [[${targetNote}]] from ${sourceFile.path}`);
            }
        }
        return changesMade;
    }
};