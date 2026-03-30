# Stories and Milestones 

This directory holds the individual milestones and stories that make up development of Mako. 

## Milestones

Project features are to be broken down into milestones. This allowed for thorough understanding and supports an easy transition into individual stories. 

## Stories

Stories are to go in `./stories/<milestone-x>`, where each `<milestone-x>` is a directory a specific milestone. 

Each story should be sequential. Naming structure is `<story>-<subtask>-<title>`. For example: "milestone-2/2-1-Implement API" is for story 2 of milestone-2, but it is the *first* subtask needed to complete this story. 

Stories can be multiple tickets. Each ticket should be the smallest unit of the feature needed toc omplete the story. For example, `milestone-1-foundation-authentication/` has ticket "1-1" to "1-6", each representing a part of what is needed to complete story 1. 

Stories should be broken down to the smallest units. If you find that multiple changes are defined in different section of the codebase, make them separate subtasks under the same story. 

## Story Format 

An individual story file is to be broken down as follows:

```
# <Title>

**Milestone**: <Milestone>
**Description**: Short summary of what this is to do
**Status**: <status of ticket, will be Todo | In-Progress | In-Review | Completed>. Default to "Todo"


## What Needs to Be Done
### 1. <Change 1>
 - [ ] Description of what is to be done
 - [ ] Description of what is to be done
...

### 2. <Change 2>
 - [ ] Description of what is to be done
 - [ ] Description of what is to be done
...

### n. <Change n>
 - [ ] Description of what is to be done
 - [ ] Description of what is to be done
...

## End Goal
Short summary of what we are to expect/expected functionality after completing this ticket

```

Refer to `./stories/milestone-1-foundation-authentication/1-1-monorepo-app-scaffolding.md` for a good real example of a ticket.

## Story Ticket Requirements

Story tickets must:
1. Use the format described above
2. Be small in scope. If you find that it's a lot of functionality for one ticket, break it down. 
3. Be sequential. Milestone 2 should follow 1 in its naming, and so on. 
4. Be detailed. Instead of saying "define X feature", when possible link the file that references it. For example, do not do "define the db table for users," instead do "define the db table defined in (link to file)." If it does not exist yet, mention that we need to detail it in the design documents first. 
5. **Always** make sure story/subtasks are aligned with existing details. Always check previous stories, and design docs in `../../infastructure/` and `../system-pitch.md` to make sure that the stories are aligned with our detailed API routes, database schemas, and methodologies. **Note:** Do not put this as a separate subtask for a story, it should be done for each subtask as it is being written.  
