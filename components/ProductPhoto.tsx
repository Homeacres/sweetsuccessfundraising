import Image from "next/image";
import type { ProductPhoto } from "@/components/product-photos";

export function ProductPhotoView({ photo }: { photo: ProductPhoto }) {
  return (
    <div className="product-photo">
      <Image
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(max-width: 800px) 100vw, 360px"
      />
    </div>
  );
}
