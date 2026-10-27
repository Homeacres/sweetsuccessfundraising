/** Finished-product photos from the old site. Keyed by products.sort_order. */
export type ProductPhoto = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

const WIDTH = 935;
const HEIGHT = 1247;

export const fruitChewsPhoto: ProductPhoto = {
  src: "/photos/fruit-chews.jpg",
  alt: "Bowl of colourful freeze-dried fruit chews",
  width: WIDTH,
  height: HEIGHT,
};

export const spheresPhoto: ProductPhoto = {
  src: "/photos/spheres.jpg",
  alt: "Bowl of pastel freeze-dried candy spheres",
  width: WIDTH,
  height: HEIGHT,
};

export const bearsPhoto: ProductPhoto = {
  src: "/photos/bears.jpg",
  alt: "Bowl of colourful freeze-dried bears",
  width: WIDTH,
  height: HEIGHT,
};

const BY_SORT: Record<number, ProductPhoto> = {
  1: fruitChewsPhoto,
  2: spheresPhoto,
  3: bearsPhoto,
};

/** Unknown sort order keeps the card's no-photo layout. */
export function productPhotoForSort(sortOrder: number | null | undefined): ProductPhoto | null {
  if (typeof sortOrder !== "number") return null;
  return BY_SORT[sortOrder] ?? null;
}
