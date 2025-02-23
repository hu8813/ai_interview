import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://ai-interview-feedback.vercel.app/",
      lastModified: new Date(),
    },
    {
      url: "https://ai-interview-feedback.vercel.app/demo",
      lastModified: new Date(),
    },
  ];
}
