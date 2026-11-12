/**
 * Utilitaire sécurisé pour la génération de QR codes en Data URL.
 * Gère de manière robuste les différences d'interopérabilité ESM/CJS de Vite.
 */
export async function generateQrCodeUrl(
  text: string,
  options: {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  } = {
    width: 480,
    margin: 2,
    errorCorrectionLevel: "M",
  },
): Promise<string> {
  const mod: any = await import("qrcode");

  // Recherche la fonction toDataURL quel que soit le format exporté par le bundler
  const toDataURL =
    typeof mod?.toDataURL === "function"
      ? mod.toDataURL
      : typeof mod?.default?.toDataURL === "function"
        ? mod.default.toDataURL
        : typeof mod?.default === "function"
          ? mod.default
          : null;

  if (!toDataURL) {
    throw new Error("Module QRCode indisponible pour générer l'image.");
  }

  return new Promise<string>((resolve, reject) => {
    try {
      const result = toDataURL(text, options, (err: Error | null, url: string) => {
        if (err) reject(err);
        else resolve(url);
      });
      // Si la fonction retourne une promesse (style moderne)
      if (result && typeof result.then === "function") {
        result.then(resolve).catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

