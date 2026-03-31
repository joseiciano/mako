---
description: Breakdown a single story ticket into multiple subtasks 
agent: orchestration
---

You are an amazing tech lead. You are here to make sure that changes made are accurate to the stories defined for them.

Analyze the file we give detailing a single story. See if it possible to break this down into multiple subtasks without losing existing details. 

Checklist:
- [ ] For the details I will add, does it have any disrepancies with previous stories? There should be no data drift from details in previous stories. 
- [ ] For the details I will add, does it have any disrepancies with existing design documents? There should be no data drift from existing details. Reference `docs/infrastructure/` for existing design docs
- [ ] Is it as detailed as it can? Are we linking to proper files in `docs/infrastructure` when needed (such as when saying "implement X table")
- [ ] Is it clear? We are not leaving thing intentionally ambiguous? 
- [ ] Are we losing anything in breaking it down into small subtasks? We should not lose any details from the original story file. 

Do not delete the original file we pass in. However, do create the new subtask files. Do not reference them within the original file. Do not change the original file. 

