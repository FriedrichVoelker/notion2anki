
const fs = require("fs");
const { Client } = require("@notionhq/client");
const axios = require("axios");
const readline = require("readline");
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// read config from config.json
try{
    fs.readFileSync("config.jsonc", "utf-8");
}catch(e){
    console.log("error", "Config file not found! Creating....");
    fs.writeFileSync("config.jsonc", `{
        "TOKEN": "YOUR_TOKEN_HERE",
        "LOG_LEVEL": "ERROR",  // INFO | ERROR | DEBUG
        "IMAGE_MODE": "folder", // base64 | url | folder
        "MEDIA_FOLDER": "YOUR_ANKI_MEDIA_FOLDER", // path to your media folder
        "ANKI_MODE": true // true | false
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
        if(pageIdPart1.length < 2){
            log("error", "Invalid notion url length error");
            process.exit(1);
        }
        // https://woozy-zucchini-9f7.notion.site/Test-0212a61f84b94818ad67f7a897300801?pvs=4
        // get last part of url
        const pageId = pageIdPart1[pageIdPart1.length - 1].split("?")[0];
        if(!pageId){
            log("error", "Invalid notion url, id not found error");
            process.exit(1);
        }
        let response;
        try{
            response = await notion.blocks.children.list({
                block_id: pageId,
                page_size: 50
            })
        }catch(e){
            log("error", "Invalid notion url, unknown error");
            process.exit(1);
        }

        const blocks = response.results;

        for(let block of blocks){
            log("debug", block);
            block = await notion.blocks.retrieve({ block_id: block.id })

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
            process.exit(0);
        }catch(e){
            log("error", "File could not be created, default to output.html")
            try{
                fs.writeFileSync("output.html", html);
                log("info", "Done!")
                process.exit(0);
            }catch(e){
                log("error", "Error while writing to output.html")
                process.exit(1);
            }
        }
}

const handleBlock = async (block) => {

    log("info", `Handling block ${block.id}`)
    // log("debug", block);

    let blockHtml = `
    <!-- 
    
    New Block 
    
    -->
    `;

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
        blockHtml += "<h1 style='background-color:#f3d16e;'>";
        for(const child of block.heading_1.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</h1>";
    }

    if(block.type == TYPE.HEADING_2){
        blockHtml += "<h2 style='background-color:#f3d16e;'>";
        for(const child of block.heading_2.rich_text){
            blockHtml += renderBlock(child);
        }
        blockHtml += "</h2>";
    }

    if(block.type == TYPE.HEADING_3){
        blockHtml += "<h3 style='background-color:#f3d16e;'>";
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
        }else if(CONFIG.IMAGE_MODE == "url"){
            blockHtml += `<img style="max-width:20vw" src="${url}">`
        }else if(CONFIG.IMAGE_MODE == "folder"){
            blockHtml += `<img style="max-width:20vw" src="${await saveImageToFolder(url, block.id)}">`
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
    let image = await axios.get(url, {responseType: 'arraybuffer'});
    return Buffer.from(image.data).toString('base64');

}

const saveImageToFolder = async (url, id) => {

    if(!CONFIG.MEDIA_FOLDER){
        log("error", "Media folder not set in config.jsonc")
        process.exit(1);
    }


    return new Promise((resolve, reject) => {
        axios
          .get(url, { responseType: 'arraybuffer' })
          .then(response => {
            const mediaFolder = CONFIG.MEDIA_FOLDER;
            const imageFilename = id +'.png';
    
            // if not exists, create subfolder called notion2anki in media folder
            if(!fs.existsSync(mediaFolder + "/notion2anki")){
                fs.mkdirSync(mediaFolder + "/notion2anki");
            }
            const imagePath = path.join(mediaFolder + "/notion2anki", imageFilename);

            fs.writeFile(imagePath, Buffer.from(response.data, 'binary'), err => {
              if (err) {
                reject(err);
              } else {
                if(!CONFIG.ANKI_MODE){

                    resolve("file://"+imagePath);
                }else{
                    resolve("notion2anki/"+imageFilename);
                }
              }
            });
          })
          .catch(error => {
            reject(error);
          });
      });
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
            answer != "" ? output_path = answer : output_path = "output.html";
            await initConvert(notion_url, output_path);
            rl.close();
        });
    });

}




const log = (level, message) => {

    // if level is error, save to error.log
    if(level.toUpperCase() == "ERROR"){
        fs.writeFileSync("error.log", message);
    }


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