
/**
 * Resizes an image file or a base64 data URI to a specific max dimension
 * and returns it as a base64 data URI.
 * @param source The image file or base64 data URI to resize.
 * @param options Options for resizing. `maxWidth` is the maximum width/height.
 * @returns A promise that resolves with the resized image as a data URI.
 */
export function resizeImage(
  source: File | string,
  options: { maxWidth: number } = { maxWidth: 1024 }, // Increased max width
): Promise<string> {
  return new Promise((resolve, reject) => {
    const handleImageLoad = (imageUrl: string) => {
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            let { width, height } = img;

            if (width > options.maxWidth || height > options.maxWidth) {
                if (width > height) {
                    height = (height * options.maxWidth) / width;
                    width = options.maxWidth;
                } else {
                    width = (width * options.maxWidth) / height;
                    height = options.maxWidth;
                }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return reject(new Error("Could not get canvas context."));
            }
            ctx.drawImage(img, 0, 0, width, height);

            // Use JPEG for better compression for photos, with a quality setting of 85%
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = (error) => {
            reject(error);
        };
    }

    if (typeof source === 'string') {
        // It's already a data URI
        handleImageLoad(source);
    } else if (source instanceof File) {
        // It's a file, read it first
        const reader = new FileReader();
        reader.readAsDataURL(source);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Could not read file."));
            }
            handleImageLoad(event.target.result as string);
        };
        reader.onerror = (error) => {
            reject(error);
        };
    } else {
        reject(new Error("Unsupported source type for image resizing."));
    }
  });
}
