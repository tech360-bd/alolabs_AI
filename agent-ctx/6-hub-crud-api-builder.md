---
Task ID: 6
Agent: Hub CRUD API Builder
Task: Create comprehensive CRUD API routes for 5 hub areas (research, education, video, interview, voice)

Work Log:
- Enhanced `/src/app/api/research-hub/route.ts` (~230 lines):
  - GET: Added `requireAuth()`, `NextRequest` with query params (status, domain, source, dateFrom, dateTo, search), DB record merging via Settings KV store, computed stats
  - POST actions: `create_project`, `submit_paper_analysis`, `create_research_gap`, `create_proposal`
  - All records persisted to `db.settings` with `research_hub:` prefix
- Enhanced `/src/app/api/education-hub/route.ts` (~260 lines):
  - GET: Added `requireAuth()`, query params (status, category, level, type, courseId, search, lang), multi-language labels (en/bn), DB record merging
  - POST actions: `create_course`, `create_assignment`, `create_exam`, `start_speaking_session`
  - Bangla (bn) language support for UI labels
- Enhanced `/src/app/api/video-hub/route.ts` (~240 lines):
  - GET: Added `requireAuth()`, query params (status, type, language, resolution, style, search), DB record merging
  - POST actions: `create_video_project`, `generate_avatar`, `start_subtitle_generation`, `create_presenter`
  - Validates project existence before subtitle generation
- Enhanced `/src/app/api/interview-hub/route.ts` (~270 lines):
  - GET: Added `requireAuth()`, query params (status, type, difficulty, candidate, category, minScore, maxScore, search), DB record merging
  - POST actions: `create_session`, `submit_feedback`, `start_practice_session`
  - Validates session existence before feedback submission, score range validation
- Enhanced `/src/app/api/voice-system/route.ts` (~290 lines):
  - GET: Added `requireAuth()`, query params (status, type, quality, language, provider, source, search), includes TTS/STT jobs and voice library
  - POST actions: `create_voice_model_config`, `start_tts_job`, `start_stt_transcription`, `add_voice_to_library`
  - Validates TTS text length, speed range, STT speaker count; lists TTS/STT job records

Stage Summary:
- All 5 hub routes now have full GET (with filtering) + POST (with validation) support
- Consistent response format: `{ success: true, data: ... }` or `{ error: string }`
- All routes use `requireAuth()`, `db` from `@/lib/db`, `NextRequest`/`NextResponse`
- User-created records stored in Settings KV store with hub-specific prefixes
- Demo data preserved as fallback; DB records merged on GET
- Zero new lint errors introduced (all pre-existing)