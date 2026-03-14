# Stories and Milestones 

This directory holds the individual milestones and stories that make up development of Mako. 

## Milestones

Project features are to be broken down into milestones. This allowed for thorough understanding and supports an easy transition into individual stories. 

## Stories

Stories are to go in `./stories/<milestone-x>`, where each `<milestone-x>` is a directory a specific milestone. 

Each story should be sequential. For example, `2-1-<specific task>` represents "milestone 2, story 1. We are completing this specific task for it". 

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
