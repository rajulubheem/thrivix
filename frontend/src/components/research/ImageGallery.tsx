import React, { useState } from 'react';
import { X, Download, ExternalLink, ZoomIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  source: string;
  width: number;
  height: number;
}

interface ImageGalleryProps {
  images: ImageResult[];
}

export default function ImageGallery({ images }: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<ImageResult | null>(null);

  const downloadImage = async (image: ImageResult) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image-${image.id}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image) => (
          <motion.div
            key={image.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative group cursor-pointer rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow"
            onClick={() => setSelectedImage(image)}
          >
            <img
              src={image.thumbnailUrl}
              alt={image.title}
              className="w-full h-48 object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-sm font-medium line-clamp-2">{image.title}</p>
                <p className="text-white/80 text-xs mt-1">{image.source}</p>
              </div>
              <div className="absolute top-2 right-2">
                <ZoomIn className="w-5 h-5 text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative max-w-5xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 to-transparent p-4 z-10">
                <div className="flex items-start justify-between">
                  <div className="text-white">
                    <h3 className="font-semibold text-lg">{selectedImage.title}</h3>
                    <p className="text-sm opacity-80">{selectedImage.source}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {selectedImage.width} × {selectedImage.height}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadImage(selectedImage)}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur transition-colors"
                    >
                      <Download className="w-5 h-5 text-white" />
                    </button>
                    <a
                      href={selectedImage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur transition-colors"
                    >
                      <ExternalLink className="w-5 h-5 text-white" />
                    </a>
                    <button
                      onClick={() => setSelectedImage(null)}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur transition-colors"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
              </div>
              <img
                src={selectedImage.url}
                alt={selectedImage.title}
                className="max-w-full max-h-[90vh] object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}