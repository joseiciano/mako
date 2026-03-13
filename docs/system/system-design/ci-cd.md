# CI/CD & Development Workflow

## GitHub Actions
We utilize GitHub Actions for our CI/CD pipeline to ensure code quality and automate deployments.
- **Linting & Type Checking**: Automated checks run on every push and pull request to enforce coding standards and catch errors early.
- **Automated Deployment**: Successful merges to the main branch trigger automated deployments to our staging and production environments.

## Pull Request Guidelines
To maintain a clean and traceable history, all pull requests must adhere to the following standards:

### Merge Strategy
- **Squash and Merge**: All commits in a pull request will be squashed into a single, clean commit when merged into the main branch.

### Commit Standards
- **Clarity**: Even though commits are squashed on merge, every individual commit within a pull request must have a clear, descriptive title and body.
- **Verification**: This ensures that the development process is transparent and that individual changes can be verified against the final pull request description.

### PR Title
- **Format**: `[TICKET-ID/NAME] Short description of changes`
- **Requirement**: The title must always include the relevant ticket number or name.

### PR Description
Every pull request description must include the following sections:
1. **What**: A clear and concise explanation of the changes introduced.
2. **Why**: The rationale behind these changes and the problem they solve.
3. **Testing**: A description of the new tests added and the testing performed (e.g., manual verification, unit tests).
4. **Documentation**: Any updates or additions required for the project documentation.

For each section:
- Use concise bullet points
- Be clear in what was done

Example Format 
```
(Title)
TICKET-1: Creating Initial Authentication Routes

(Description)
WHAT
- Creating sign up route 
- Creating sign out route
- Creating sign in route 

WHY
- We want a user to be able to sign in with their own account 
- This will allow us to support adding extra profile information for each user 

TESTING
- Added integration tests 
- Added unit tests

DOCUMENTATION
- Added to openapi spec

```
