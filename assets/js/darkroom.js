/* =====================================================================
   Bready Darkroom - the one photo studio for every upload on Toy Buddies
   (figure photos in the catalogue, gallery photos, and re-editing photos
   that are already uploaded).

   It's the shared photo editor (photo-editor.js) dressed for this shop:
   crop, recentre, zoom, rotate & straighten, colour & light sliders tuned
   for toy photos, and size optimisation before anything is stored.

     import { darkroom, darkroomMany, DARKROOM } from "./darkroom.js";
     const r = await darkroom(file, DARKROOM.figure);          // { blob, look, rest } or null
     await darkroomMany(files, DARKROOM.gallery, onPhoto);       // batch: edit, skip, or "rest as they are"
   ===================================================================== */
import { photoEditor, editMany, fetchPhoto, setPhotoEditorNotify } from "./photo-editor.js";

// Toys want crisp, true colour: only a touch of warmth (the editor's default is a warm "food" look).
export const TOY_LOOK = { warmth: 12, bright: 4, vibrance: 22 };
export const NO_LOOK = { warmth: 0, bright: 0, vibrance: 0 };

// Output sizes per kind of upload (longest side + file-size budget).
export const DARKROOM = {
  // Figure photos show in the 4:3 wanted-poster frame, so the crop is locked to 4:3.
  figure:  { out: { max: 1400, target: 300 * 1024 }, aspect: 4 / 3, lockAspect: "4:3 \u2014 the shape of the wanted-poster frame", look: TOY_LOOK },
  // Gallery photos keep any shape; they're already edited, so no extra colour by default.
  gallery: { out: { max: 1400, target: 220 * 1024 }, aspect: "orig", look: NO_LOOK },
};

const BRAND = { heading: "Bready Darkroom", lookLabel: "Colour & light" };

export function useToasts(toast) { setPhotoEditorNotify((m) => toast(m, true)); }

export function darkroom(file, opts = {}) {
  return photoEditor(file, { ...BRAND, ...opts });
}

export function darkroomMany(files, opts, onPhoto) {
  return editMany(files, { ...BRAND, ...opts }, onPhoto);
}

// Re-open a photo that's already uploaded.
export async function darkroomUrl(url, opts = {}) {
  return darkroom(await fetchPhoto(url), opts);
}
