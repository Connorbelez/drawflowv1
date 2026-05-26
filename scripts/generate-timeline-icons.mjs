import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const sourceDir = resolve("public/milestone-icons/source");
const outDir = resolve("public/milestone-icons");

const iconSources = {
  change: "change.jpg",
  closeout: "closeout.jpg",
  drywall: "drywall.jpg",
  exterior: "exterior.jpg",
  finishes: "finishes.jpg",
  foundation: "foundation.jpg",
  framing: "framing.jpg",
  roughIn: "roughIn.jpg",
};

function mimeFor(fileName) {
  return fileName.endsWith(".png") ? "image/png" : "image/jpeg";
}

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { height: 640, width: 640 },
});

for (const [name, sourceName] of Object.entries(iconSources)) {
  const sourcePath = resolve(sourceDir, sourceName);
  const source = await readFile(sourcePath);
  const dataUrl = `data:${mimeFor(sourceName)};base64,${source.toString("base64")}`;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a focused asset-processing routine; splitting the browser-side pixel pass would make it harder to audit.
  const pngDataUrl = await page.evaluate(async (imageUrl) => {
    const image = new Image();
    image.decoding = "async";
    image.src = imageUrl;
    await image.decode();

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;

    const sourceContext = sourceCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!sourceContext) {
      throw new Error("Could not create source canvas context");
    }

    sourceContext.drawImage(image, 0, 0);

    const imageData = sourceContext.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );
    const { data, height, width } = imageData;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    function pixelOffset(index) {
      return index * 4;
    }

    function isBackgroundCandidate(index) {
      const offset = pixelOffset(index);
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const chroma = max - min;

      return (
        brightness > 238 ||
        (brightness > 222 && chroma < 32 && r > 210 && g > 210 && b > 205)
      );
    }

    function enqueue(index) {
      if (visited[index] || !isBackgroundCandidate(index)) {
        return;
      }

      visited[index] = 1;
      queue[tail] = index;
      tail += 1;
    }

    for (let x = 0; x < width; x += 1) {
      enqueue(x);
      enqueue((height - 1) * width + x);
    }

    for (let y = 0; y < height; y += 1) {
      enqueue(y * width);
      enqueue(y * width + width - 1);
    }

    while (head < tail) {
      const index = queue[head];
      head += 1;

      const x = index % width;
      const y = Math.floor(index / width);

      if (x > 0) {
        enqueue(index - 1);
      }
      if (x < width - 1) {
        enqueue(index + 1);
      }
      if (y > 0) {
        enqueue(index - width);
      }
      if (y < height - 1) {
        enqueue(index + width);
      }
    }

    for (let index = 0; index < visited.length; index += 1) {
      if (!visited[index]) {
        continue;
      }

      data[pixelOffset(index) + 3] = 0;
    }

    for (let index = 0; index < visited.length; index += 1) {
      if (visited[index]) {
        continue;
      }

      const x = index % width;
      const y = Math.floor(index / width);
      const offset = pixelOffset(index);
      const brightness =
        (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
      const touchesBackground =
        (x > 0 && visited[index - 1]) ||
        (x < width - 1 && visited[index + 1]) ||
        (y > 0 && visited[index - width]) ||
        (y < height - 1 && visited[index + width]);

      if (touchesBackground && brightness > 230) {
        data[offset + 3] = 0;
      }
    }

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[pixelOffset(y * width + x) + 3] <= 0) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const cropPad = Math.round(Math.max(width, height) * 0.018);
    const cropX = Math.max(0, minX - cropPad);
    const cropY = Math.max(0, minY - cropPad);
    const cropWidth = Math.min(width - cropX, maxX - minX + cropPad * 2);
    const cropHeight = Math.min(height - cropY, maxY - minY + cropPad * 2);

    sourceContext.putImageData(imageData, 0, 0);

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = 512;
    outputCanvas.height = 512;

    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) {
      throw new Error("Could not create output canvas context");
    }

    outputContext.clearRect(0, 0, 512, 512);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";

    const targetSize = 482;
    const scale = Math.min(targetSize / cropWidth, targetSize / cropHeight);
    const drawWidth = cropWidth * scale;
    const drawHeight = cropHeight * scale;
    const drawX = (512 - drawWidth) / 2;
    const drawY = (512 - drawHeight) / 2 - 4;

    outputContext.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );

    return outputCanvas.toDataURL("image/png");
  }, dataUrl);

  await writeFile(
    resolve(outDir, `${name}.png`),
    Buffer.from(pngDataUrl.split(",")[1], "base64")
  );
}

await browser.close();
