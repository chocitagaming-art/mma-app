// The poster of a YouTube video, by size.
//
// The event videos (face-off, weigh-in, press conference, fight video) ask for
// sddefault (640×480) and keep hqdefault (480×360) as the fallback. On
// 30-oct-2026 the UFC uploaded the weigh-in of the 1099 (AD5HnrXf5MY) with the
// face-off picture as its poster and changed it 16 minutes later; three hours
// on, i.ytimg.com still served the OLD hqdefault to 13 of 40 requests, while
// sddefault answered with the new one 40 of 40 (the ETag is the version time).
export type YouTubeThumbnailSize = "sddefault" | "hqdefault";

export function youtubeThumbnail(videoId: string, size: YouTubeThumbnailSize): string {
  return `https://i.ytimg.com/vi/${videoId}/${size}.jpg`;
}

// A size the video does not have (sddefault needs an upload of 480p or more)
// answers 404 with a grey 120×90 image: a loaded image this narrow is that
// placeholder, not a poster. 0 means "not decoded yet".
export function isYouTubePlaceholder(naturalWidth: number): boolean {
  return naturalWidth > 0 && naturalWidth <= 120;
}
