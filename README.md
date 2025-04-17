# Sibling Linker 

An Obsidian plugin that links sibling wikilinks mentioned in the same line by adding them to the frontmatter of referenced notes. 
## Problem / what this plugin does 
I use Obsidian as a [Zettelkasten](https://zettelkasten.de/introduction/), and while Obsidian generally does everything I want, I wanted to see how ideas naturally connect in the graph view. 

My workflow and how this plugin solves the problem 
1. Create a new daily note each day. 
2. Write [atomic facts](https://www.britannica.com/topic/atomic-fact) in the daily note, one per line, with wikilink references to any element I might want to look up later. For example: `[[George Washington]] was the first president of the [[United States of America]]`. 
3. Use the [Auto Note Creator](https://github.com/SimonTC/obsidian-note-autocreation) plugin to automatically create referenced notes, and [Templater](https://github.com/SilentVoid13/Templater) paired with the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin to populate these child notes with related atomic facts. (See the "Related Context" Dataview query below.) 

Example daily note: ![Example Daily Note](./readme-images/Pasted%20image%2020250417092447.png) The Auto Note Creator and Dataview plugins create child notes like these: ![Example George Washington Note](./readme-images/Pasted%20image%2020250417092521.png) ![Example United State of America Note](./readme-images/Pasted%20image%2020250417092535.png)
However, because Dataview cannot create hard links (direct wikilinks between notes), the child notes are not connected in the graph view: ![Unlinked Graph](./readme-images/Pasted%20image%2020250417092636.png) 

The Sibling Linker plugin detects that `[[George Washington]]` and `[[United States of America]]` appear in the same line of a daily note. It then adds a `mentions` property to each child note’s frontmatter, referencing the other. The updated child notes look like this: ![Linked George Washington Note](./readme-images/Pasted%20image%2020250417092721.png) *(The `United States of America` note also receives `mentions: [[George Washington]]`.)* 

This connects the notes in the graph view!
![Linked Graph](./readme-images/Pasted%20image%2020250417092739.png) 

The workflow is seamless: I open a daily note, type `@George Washington [Enter] was the first president of the @United States of America [Enter]`. Child notes are automatically created, populated with context, and linked as siblings.
## Features 
- Monitors files matching a regex pattern (default: `YYYY-MM-DD` daily notes) for changes. 
- Adds sibling wikilinks to a configurable frontmatter property (default: `mentions`). 
- **Configurable settings:** 
	- **File name regex**: Filter files to process (e.g., daily notes). 
	- **Verbose logging**: Enable detailed console logs for debugging. 
	- **Processing notices**: Toggle notifications for completed actions. 
	- **Debounce delay**: Adjust delay before processing file changes. 
	- **Property name**: Customize the frontmatter property for mentions. 
	- **Exclude paths**: Skip specific files or folders. 
	- **Full-vault scan**: Manually process all matching files via a settings button.

## Installation
1. Clone this repository into your .obsidian/plugins/ folder for your vault.
2. Restart Obsidian.md, or force reload without saving through the command palette. 
## Support
Report issues or suggest features on [Github](https://github.com/ConradSelig/Sibling-Linker).


# "Related Context" Dataview

Here is the data query I use to grab each child's atomic facts. Fair warning that this was written specifically for my vault, so you may need to modify the query yourself to get it to work. Most likely, this just means changing the folder name at the top to whichever folder you store your atomic facts in.

```dataviewjs
const currentTitle = dv.current().file.name;
const dailyNotes = dv.pages('"Daily Notes"');

for (let page of dailyNotes) {
    let content = app.vault.cachedRead(app.vault.getAbstractFileByPath(page.file.path));
    content.then(text => {
        let matchingLines = text.split('\n').filter(line => line.includes(currentTitle));
        if (matchingLines.length > 0) {
            dv.header(3, page.file.name);
            for (let line of matchingLines) {
                dv.paragraph(line);
            }
        }
    });
}
```
