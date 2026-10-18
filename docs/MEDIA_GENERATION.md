# Media generation

Status: implemented and wired to the UI. Provider calls fail loudly with
`Configuration required: …` (HTTP 503) when a key or endpoint is missing —
there is no sample image, silent success or invented job id anywhere in the
path.

## Surface

| Page | Endpoint | Kind |
|---|---|---|
| Media Studio panel | `POST /api/media/generate` | `image` \| `audio` \| `video` \| `music` |
| Media Studio recent list | `GET /api/media/generate` | all kinds |
| Image Studio | `POST /api/image-studio/generate` | image |
| Music Studio | `POST /api/music-studio/generate`, `GET /api/music-studio/tracks` | music |
| Video Studio | `POST /api/video-studio/generate`, `GET /api/video-studio/productions` | video |
| Avatar & Voice | `POST /api/avatar-voice/generate-avatar`, `POST /api/avatar-voice/generate-voice`, `GET /api/avatar-voice/avatars` | image / audio |
| Job polling | `GET /api/media/jobs/:id` | video / music |
| Subtitles / transcript | `POST /api/video-studio/transcribe` | audio → SRT/VTT |

All routes require an authenticated user with a company (`requireCompanyAuth`).
Jobs are scoped to the caller's company; a job from another company returns 404.

## Configuration

| Variable | Used for |
|---|---|
| `MEDIA_API_KEY` (or `OPENAI_API_KEY`) | Bearer token |
| `MEDIA_BASE_URL` | Base for image + speech (default `https://api.openai.com/v1`) |
| `MEDIA_IMAGE_MODEL` | default `gpt-image-1` |
| `MEDIA_AUDIO_MODEL` | default `gpt-4o-mini-tts` |
| `MEDIA_VIDEO_ENDPOINT`, `MEDIA_VIDEO_STATUS_ENDPOINT`, `MEDIA_VIDEO_MODEL` | video jobs |
| `MEDIA_MUSIC_ENDPOINT`, `MEDIA_MUSIC_STATUS_ENDPOINT`, `MEDIA_MUSIC_MODEL` | music jobs |
| `MEDIA_TRANSCRIBE_MODEL` | transcription model (default `whisper-1`) |

`MEDIA_VIDEO_STATUS_ENDPOINT` and `MEDIA_MUSIC_STATUS_ENDPOINT` may contain
`{id}` (or `{jobId}`), replaced with the provider job id.

The image and speech calls are the OpenAI contract:

- `POST {base}/images/generations` → `{ data: [{ b64_json | url }] }`
- `POST {base}/audio/speech` → audio bytes (`response_format`: mp3/wav/opus)

Video and music are *job* contracts. The request body is:

```json
{ "model": "…", "prompt": "…", "duration_seconds": 5 }
{ "model": "…", "prompt": "…", "genre": "pop", "mood": "upbeat" }
```

A synchronous provider may answer `{ "output": "https://…" }` (or `url`). An
asynchronous provider answers `{ "id": "job-123" }`; the job is stored as
`processing` and `GET /api/media/jobs/:id` polls the status endpoint, which must
answer `{ "status": "succeeded" | "failed", "output": "…", "error": "…" }`.

## Transcription and subtitles

`POST /api/video-studio/transcribe` accepts multipart `file` (audio or video,
≤25 MB), optional `language`, `prompt` and `projectId`. It calls
`{MEDIA_BASE_URL}/audio/transcriptions` with `response_format=verbose_json` and
returns `{ text, language, srt, vtt, segments }`. With `projectId`, the SRT is
attached to a Video Hub project as a `video_hub:subtitle:<project>:<language>`
record with `status: "ready"` — replacing the old action that only marked a
subtitle request `pending`.

This is the transcription half of the VideoCaptioner capability. Translation
and subtitle **burn-in** still require an ffmpeg media worker; the route does
not pretend to burn anything.

## Email open tracking

`src/lib/email/tracking.ts` signs `HMAC-SHA256(scope:messageId)` with
`EMAIL_TRACKING_SECRET` and the send route embeds:

```
<img src="{APP_URL}/api/email/track/open/<token>.gif?m=<messageId>">
```

The public route verifies the signature (constant-time), records an
`email_open` row in AuditLog and always returns the 1×1 GIF. This replaces the
old data-URL pixel, which could never contact the server, and the per-instance
Map that lost every event on restart. When `trackOpens` is requested without a
secret the send route returns 400 rather than claiming tracking is on.

## Storage and records

Produced bytes are written through `getStorage()` into the folder
`generated-<kind>` and a `media:file:<storage-key>` Settings record is created,
so the asset appears in the Media Library (`GET /api/media`). Asynchronous
providers that return an external URL are recorded as `external: true` assets;
their bytes are not copied locally.

Job records live in Settings under `media:job:<uuid>` with:

```json
{
  "id": "…", "kind": "image|audio|video|music", "prompt": "…",
  "model": "…", "status": "processing|completed|failed",
  "provider": "…", "providerJobId": null,
  "assets": [{ "id": "…", "url": "…", "mimeType": "…", "kind": "…", "external": false }],
  "error": null, "metadata": { "genre": "pop", "consent": true },
  "companyId": "…", "userId": "…", "createdAt": "…", "updatedAt": "…"
}
```

## Consent

Avatar and voice routes require `consent: true` in the body and refuse with 400
otherwise. This matches the existing Avatar & Voice page, which disables the
buttons until the consent switch is on. Voice "styles" are passed as
`instructions` to models that support them; providers that ignore the field
still return audio.

## Tests

`__tests__/unit/lib/media-generation.test.ts` covers configuration resolution,
request building (including clamping and endpoint guards) and input validation —
15 tests. The routes themselves are not exercised here because the sandbox has
no Prisma client or provider credentials; their imports and syntax are checked
with esbuild.
