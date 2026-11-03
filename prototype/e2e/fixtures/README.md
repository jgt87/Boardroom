# Browser test media

`clip.webm` is a locally generated, one-second blue 64 × 48 VP8 video at 10 fps,
with no audio. It contains no captured or third-party media.

Generated with FFmpeg:

```sh
ffmpeg -f lavfi -i 'color=c=blue:s=64x48:r=10:d=1' -c:v libvpx -an clip.webm
```

The file is committed so running the tests does not require FFmpeg or depend on
headless Chrome's canvas recording timing.
