
const fs = require("fs");
const { Client } = require("@notionhq/client");
const axios = require("axios");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// read config from config.json
try{
    fs.readFileSync("config.jsonc", "utf-8");
}catch(e){
    console.log("Config file not found! Creating....");
    fs.writeFileSync("config.jsonc", `{
        "TOKEN": "YOUR_TOKEN_HERE",
        "LOG_LEVEL": "ERROR",  // INFO | ERROR | DEBUG
        "IMAGE_MODE": "url" // base64 | url
}`);
    process.exit(1);
}
const readConfigFromJSONC = fs.readFileSync("config.jsonc", "utf-8");
// remove comments
const readConfigFromJSON = readConfigFromJSONC.replace(/\/\/.*/g, "");
// parse json
const CONFIG = JSON.parse(readConfigFromJSON);



const TOKEN = CONFIG.TOKEN;

const notion = new Client({ auth: TOKEN })

// callouts

const TYPE = {
    PARAGRAPH: "paragraph",
    DIVIDER: "divider",
    HEADING_1: "heading_1",
    HEADING_2: "heading_2",
    HEADING_3: "heading_3",
    IMAGE: "image",
    COLUMN_LIST: "column_list",
    COLUMN: "column",
    BULLET_LIST: "bulleted_list_item",
    TOGGLE: "toggle",
    CALLOUT: "callout",

}


    
let html = `<style>
body{
    font-family:ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
    padding: 20px;
}
</style>`;


const initConvert = async (input, output_path) => {
        log("info", "Starting...")

        const pageIdPart1 = input.split("-")
        if(pageIdPart1.length != 2){
            console.log("Invalid notion url");
            process.exit(1);
        }

        // get last part of url
        const pageId = pageIdPart1[pageIdPart1.length - 1].split("?")[0];
        if(!pageId){
            console.log("Invalid notion url");
            process.exit(1);
        }
        let response;
        try{
            response = await notion.blocks.children.list({
                block_id: pageId,
                page_size: 50
            })
        }catch(e){
            console.log("Invalid notion url");
            process.exit(1);
        }

        const blocks = response.results;

        // get all block ids from page
        const blockIds = blocks.map((block) => block.id);

        // get all block contents from page
        const blockContents = await Promise.all(blockIds.map(async (blockId) => {
            const response = await notion.blocks.retrieve({ block_id: blockId })
            return response;
        }));


        for(const block of blockContents) {

            html += await handleBlock(block);

        }

        log("info", `Writing to ${output_path}`)
        // if file does not exist, create it
        if(!fs.existsSync(output_path)){
            fs.writeFileSync(output_path, "");
        }
        try{
            fs.writeFileSync(output_path, html);
            log("info", "Done!")
        }catch(e){
            log("error", "File could not be created, default to output.html")
            try{
                fs.writeFileSync("output.html", html);
            }catch(e){
                log("error", "Error while writing to output.html")
            }
        }


}

const handleBlock = async (block) => {

    log("info", `Handling block ${block.id}`)
    // log("debug", block);

    let blockHtml = "";

    if(block.type == TYPE.PARAGRAPH){
        blockHtml += "<p>";
        for(const child of block.paragraph.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</p>";
    }

    if(block.type == TYPE.DIVIDER){
        blockHtml += "<hr>"
    }

    if(block.type == TYPE.HEADING_1){
        blockHtml += "<h1>";
        for(const child of block.heading_1.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</h1>";
    }

    if(block.type == TYPE.HEADING_2){
        blockHtml += "<h2>";
        for(const child of block.heading_2.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</h2>";
    }

    if(block.type == TYPE.HEADING_3){
        blockHtml += "<h3>";
        for(const child of block.heading_3.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</h3>";
    }

    if(block.type == TYPE.IMAGE){
        const url = block.image.file.url;

        if(CONFIG.IMAGE_MODE == "base64"){
            const base64 = await convertImageToBase64(url);
            blockHtml += `<img style="max-width:20vw" src="data:image/png;base64,${base64}">`
        }else{
            blockHtml += `<img style="max-width:20vw" src="${url}">`
        }
    }

    if(block.type == TYPE.COLUMN_LIST){
        blockHtml += "<div "

        // get children
        const children = await notion.blocks.children.list({
            block_id: block.id,
            page_size: 50
        })
        const childBlocks = children.results;
        blockHtml += `style="display:grid;grid-template-columns:repeat(${childBlocks.length}, 1fr);gap:20px;">`
        for(const child of childBlocks){
            blockHtml += await handleBlock(child);
        }
        blockHtml += "</div>"
    }

    if(block.type == TYPE.COLUMN){
        blockHtml += "<div>"
        const children = await notion.blocks.children.list({
            block_id: block.id,
            page_size: 50
        })
        const childBlocks = children.results;
        for(const child of childBlocks){
            blockHtml += await handleBlock(child);
        }
        blockHtml += "</div>"
    }

    if(block.type == TYPE.BULLET_LIST){
        blockHtml += "<ul>"
        for(const child of block.bulleted_list_item.rich_text){
            blockHtml += `<li>${renderBlock(child)}</li>`
        }
        blockHtml += "</ul>"
    }

    if(block.type == TYPE.TOGGLE){
        blockHtml += "<details>"
        blockHtml += `<summary>${block.toggle.rich_text[0].plain_text}</summary>`
        const children = await notion.blocks.children.list({
            block_id: block.id,
            page_size: 50
        })
        const childBlocks = children.results;
        for(const child of childBlocks){
            blockHtml += await handleBlock(child);
        }
        blockHtml += "</details>"
    }


    if(block.type == TYPE.CALLOUT){
        blockHtml += `<div style="background-color:${block.callout.color.split("_background")[0]};padding:10px;border-radius:5px;">`
        blockHtml += `<span>${block.callout.icon.emoji}</span>&nbsp;`
        for(const child of block.callout.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</div>"
    }



    return blockHtml;
}

const convertImageToBase64 = async (url) => {
    // const response = await fetch(url);
    // const buffer = await response.arrayBuffer();
    // const base64 = Buffer.from(buffer).toString("base64");
    // return base64;

    let image = await axios.get(url, {responseType: 'arraybuffer'});
    return Buffer.from(image.data).toString('base64');

}





const renderBlock = (block) => {
    let renderedBlock = "";

    let styleString = "";

    if(block.annotations.color && block.annotations.color != "default"){
        styleString += `color:${block.annotations.color};`
    }

    if(block.annotations.bold){
        styleString += `font-weight:bold;`
    }

    if(block.annotations.italic){
        styleString += `font-style:italic;`
    }

    if(block.annotations.underline || block.annotations.strikethrough){
        styleString += `text-decoration:`

        if(block.annotations.strikethrough){
            styleString += `line-through `
        }
        if(block.annotations.underline){
            styleString += `underline `
        }
        styleString += `;`
    }
    if(styleString != ""){
        renderedBlock += `<span style="${styleString}">`
    }else{
        renderedBlock += "<span>"
    }

    renderedBlock += block.plain_text;
    renderedBlock = renderedBlock.replace(/\n/g, "<br>")

    renderedBlock += "</span>"
    return renderedBlock;
}


const help = () => {
    console.log("notion2anki [options] <notion url> [output]")
    console.log("")
    console.log("Options:")
    console.log("  -h, --help     Show help")
    console.log("  -v, --version  Show version number")
}


const main = async () => {

    let notion_url = null;
    let output_path = "output.html";

    process.argv.forEach(function (val, index, array) {
        if(val == "-h" || val == "--help"){
            help();
            process.exit(0);
        }
        if(val == "-v" || val == "--version"){
            const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
            console.log("Version: " + packageJson.version);
            process.exit(0);
        }

        if(val.startsWith("http")){
            notion_url = val;
        }

        if(notion_url && val != notion_url){
            output_path = val;
        }
    });


    if(notion_url){
        
        await initConvert(notion_url, output_path);
        return;
    }

    rl.question("Please provide a notion url: ", (answer) => {
        notion_url = answer;
        rl.question("Please provide a output path (leave empty for output.html): ", async (answer) => {
            output_path = answer;
            rl.close();
            await initConvert(notion_url, output_path);
        });
    });

}




const log = (level, message) => {

    const LEVELS = {
        INFO: 0,
        ERROR: 1,
        DEBUG: 2,
    }

    let configLevel = CONFIG.LOG_LEVEL;
    if(!configLevel){
        configLevel = "INFO";
    }

    if(LEVELS[level.toUpperCase()] > LEVELS[configLevel]){
        return;
    }

    // if 

    console.log(`[${level.toUpperCase()}]`, message)
}






main();