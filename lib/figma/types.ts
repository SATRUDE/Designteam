export type PublishMode = "desktop" | "mobile";

export type FigmaPublishImageInput = {
  name: string;
  base64: string;
};

export type FigmaPublishItemInput = {
  url: string;
  mode: PublishMode;
  images: FigmaPublishImageInput[];
};
