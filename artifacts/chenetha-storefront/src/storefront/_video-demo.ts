import { products } from "./_shared";

export const VIDEO_STORAGE_KEY = "kq-video-posts";
export const VIDEO_UPDATE_EVENT = "kq-video-posts-updated";

export type VideoPost = {
  id: string;
  title: string;
  caption: string;
  productId: string;
  duration: number;
  fileName: string;
  videoUrl: string | null;
  poster: string;
  createdAt: number;
  samplePoster?: boolean;
};

export const starterVideos: VideoPost[] = [
  {
    id: "sample-nila",
    title: "Nila Ikat",
    caption: "",
    productId: "nila",
    duration: 18,
    fileName: "",
    videoUrl: null,
    poster: products.find((product) => product.id === "nila")!.image,
    createdAt: 3,
    samplePoster: true,
  },
  {
    id: "sample-surya",
    title: "Surya Kanchipuram",
    caption: "",
    productId: "surya",
    duration: 24,
    fileName: "",
    videoUrl: null,
    poster: products.find((product) => product.id === "surya")!.image,
    createdAt: 2,
    samplePoster: true,
  },
  {
    id: "sample-gulmohar",
    title: "Gulmohar Jamdani",
    caption: "",
    productId: "gulmohar",
    duration: 14,
    fileName: "",
    videoUrl: null,
    poster: products.find((product) => product.id === "gulmohar")!.image,
    createdAt: 1,
    samplePoster: true,
  },
  {
    id: "sample-mira",
    title: "Mira Narayanpet",
    caption: "",
    productId: "mira",
    duration: 20,
    fileName: "",
    videoUrl: null,
    poster: products.find((product) => product.id === "mira")!.image,
    createdAt: 0,
    samplePoster: true,
  },
  {
    id: "sample-ambar",
    title: "Ambar Banarasi",
    caption: "",
    productId: "ambar",
    duration: 22,
    fileName: "",
    videoUrl: null,
    poster: products.find((product) => product.id === "ambar")!.image,
    createdAt: -1,
    samplePoster: true,
  },
];

export function readVideoPosts(): VideoPost[] {
  try {
    const saved = localStorage.getItem(VIDEO_STORAGE_KEY);
    if (saved === null) return starterVideos;
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return starterVideos;
    return parsed.filter((item): item is VideoPost =>
      !!item && typeof item.id === "string" && typeof item.productId === "string"
      && typeof item.title === "string" && typeof item.poster === "string"
    );
  } catch {
    return starterVideos;
  }
}

export function saveVideoPosts(posts: VideoPost[]) {
  try {
    localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(posts));
    window.dispatchEvent(new CustomEvent(VIDEO_UPDATE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeVideoPosts(onUpdate: () => void) {
  window.addEventListener(VIDEO_UPDATE_EVENT, onUpdate);
  window.addEventListener("storage", onUpdate);
  return () => {
    window.removeEventListener(VIDEO_UPDATE_EVENT, onUpdate);
    window.removeEventListener("storage", onUpdate);
  };
}

export function formatVideoDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
