AI feedback generation is a multi-stage process triggered upon interview completion:

1. **Data Aggregation**: The system collects the session transcript (generated via Cloudflare AI/Whisper) and Excalidraw snapshots stored in R2.
2. **Contextualization**: The data is enriched with metadata (interview type, difficulty level, and candidate alias).
3. **Analysis Engine**: A Cloudflare Workflow sends the aggregated context to the **AI Gateway**, which prompts a high-reasoning LLM to evaluate the candidate across specific dimensions (e.g., Communication, Technical Depth, Scalability).
4. **Persistence**: The resulting JSON feedback is saved to the `Interviews` table, and the user is notified via the app or email.
