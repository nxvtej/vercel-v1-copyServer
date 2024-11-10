import express from 'express'
import cors from 'cors'
import path from 'path'

import { deleteAllObjects, uploadfiletoBucket } from './cloudflare'
import { generateRandomId } from './utils'
import { getAllFiles } from './getAllFiles'
import { simpleGit } from 'simple-git'
import { createClient } from 'redis'
import dotenv from 'dotenv'

dotenv.config()
const publisher = createClient();
const subscriber = createClient();
const app = express()
const port = process.env.PORT || 8000;
const git = simpleGit()

app.use(cors())
app.use(express.json())
publisher.connect()
subscriber.connect()

app.post('/deploy', async (req, res) => {

    const repoUrl = req.body.repoUrl
    const userCustomId = req.body.id

    console.log("github repo link:", repoUrl)
    const id = userCustomId ? userCustomId : generateRandomId()

    console.log("cloning id:", id)
    // await git.clone(repoUrl, `output/${id}`) inside root dir

    const outputDir = path.join(__dirname, `output/${id}`)
    await git.clone(repoUrl, outputDir)// inside dist folder cause of path.join(__dirname, `output/${id}`)
    const files = getAllFiles(outputDir)


    console.log("uploading...")

    // uploading into r2

    /*
    files.forEach(async (file) => {
        // removes the dir + / and rest is where file will be put

        // content will be
        // /users/nxvtej/vercel-1.0/dist/output/123/src/app.jsx
        await uploadfiletoBucket(file.slice(__dirname.length + 1), file)
    })
    */

    for (const file of files) {
        const relativePath = path.relative(outputDir, file)
        const s3Key = path.join(`output/${id}`, relativePath).replace(/\\/g, '/')
        await uploadfiletoBucket(s3Key, file)
        // could have get the response as array of status, and check all to be true
        // iif not then some file not uploaded
    }


    publisher.lPush("build-id", id)
    // set is llike insert 
    publisher.hSet("status", id, "uploaded")

    console.log("files uploaded .")
    res.status(200).json({
        message: "repo copied into ouput under id",
        id: id
    })
})

app.get("/status", async (req, res) => {
    const id = req.query.id;
    const response = await subscriber.hGet("status", id as string)
    res.json({
        status: response
    })
})


app.get("/delete", async (req, res) => {
    // const id = req.query.id;
    const bucket = "vercel"
    deleteAllObjects(bucket);

    res.json({
        message: "All files deleted"
    })

})


app.listen(port, () => {
    console.log(`Server is running on port ${port}...`)
})

/*
app.post('/deploy', async (req, res) => {
    try {
        // Upload all files while maintaining directory structure
        const uploadResults = await s3Service.uploadDirectory(outputDir, `output/${id}`);

        // Check for any upload failures
        const failures = uploadResults.filter(result => !result.success);
        if (failures.length > 0) {
            console.error('Some files failed to upload:', failures);
            return res.status(500).json({
                message: 'Some files failed to upload',
                failures,
                id
            });
        }
        // Clean up: Remove local files after successful upload
        await fs.promises.rm(outputDir, { recursive: true, force: true });

        res.status(200).json({
            message: "Repository successfully deployed",
            id: id
        });
    } catch (error) {
        console.error('Deploy error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});
*/




