import { IncomingForm } from "formidable";
import path from "path";
import os from "os";
import { Readable } from 'stream';
const fs = require("fs");

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY) {
    return res.status(500).json({ error: "Azure OpenAI credentials not configured" });
  }

  // Use OS-specific temp directory
  const tmpDir = os.tmpdir();

  // Parse the incoming form data
  const fData = await new Promise<{ fields: any; files: any }>(
    (resolve, reject) => {
      const form = new IncomingForm({
        multiples: false,
        uploadDir: tmpDir,
        keepExtensions: true,
      });
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    }
  );

  const videoFile = fData.files.file;
  const videoFilePath = videoFile?.filepath;
  console.log('Temp file path:', videoFilePath);

  try {
    // Read the file into a buffer
    const fileBuffer = fs.readFileSync(videoFilePath);
    
    // Create form data boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Create the multipart form-data manually
    const formData = Buffer.concat([
      // First part - file
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="audio.mp3"\r\n` +
        `Content-Type: audio/mpeg\r\n\r\n`
      ),
      fileBuffer,
      Buffer.from('\r\n'),
      // Second part - model
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `${process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT}\r\n` +
        `--${boundary}--\r\n`
      )
    ]);

    // Call Azure OpenAI Whisper API with your original URL structure
    const transcriptionResponse = await fetch(
      `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'api-key': process.env.AZURE_OPENAI_API_KEY!,
        },
        body: formData,
      }
    );

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error('Transcription API error:', errorText);
      throw new Error(`Transcription failed: ${transcriptionResponse.statusText}. ${errorText}`);
    }

    const transcriptionData = await transcriptionResponse.json();
    const transcript = transcriptionData.text;

    res.status(200).json({ transcript });
    return { text: transcript };
  } catch (error) {
    console.error("server error", error);
    res.status(500).json({ error: String(error) });
  } finally {
    // Clean up the temporary file
    try {
      if (videoFilePath && fs.existsSync(videoFilePath)) {
        fs.unlinkSync(videoFilePath);
      }
    } catch (err) {
      console.error('Error cleaning up temp file:', err);
    }
  }
}