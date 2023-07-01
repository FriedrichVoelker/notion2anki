# notion2anki

1. Create a Integration under https://www.notion.so/my-integrations
2. Get the secret and paste it under TOKEN in config.jsonc
3. In Notion add the Integration to your page
4. Run the Program
5. Set the config variables
    - If IMAGE_MODE is set as folder you also have to add your MEDIA_FOLDER (remember to replace your single \ with \\\ )
    - If IMAGE_MODE is set to folder and should be used in Anki instead of in normal HTML files, set ANKI_MODE to true, else set it to false