# Digital Trust Hub — backend changes

Drop these files into your `gmbtebac` repo at the matching paths.

**Run these two migrations against your DB before deploying**
(or `npx prisma migrate dev` after merging schema.prisma, if you're
generating fresh):
- prisma/migrations/20260803120000_add_chat_persona/
- prisma/migrations/20260803130000_add_concerns/

New:
- src/concern/ (concern.module.ts, concern.controller.ts, concern.service.ts, dto/create-concern.dto.ts)

Modified:
- prisma/schema.prisma (ChatPersona enum + persona field, Concern model)
- src/app.module.ts (registers ConcernModule)
- src/chatbot/dto/send-chat-message.dto.ts (optional persona field)
- src/chatbot/platform-context.ts (buildDigitalTrustContext)
- src/chatbot/chatbot.service.ts (persona-aware system prompts)
- src/users/users.service.ts, src/users/users.controller.ts (GET /users/session)
