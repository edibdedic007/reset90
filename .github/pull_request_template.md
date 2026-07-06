# Pull Request Template

    ## Purpose
    Standardize review information for Reset90 changes.

    ## Scope
    - Applies to pull requests or self-review before merging branches.

    ## Assumptions
    - Even solo development benefits from a review checklist.

    ## Success Criteria
    - Every merge has clear scope, tests, deployment notes, and rollback notes.

    ## Deliverables
    - PR summary fields and checklist.

    ## Summary

What changed and why?

## Scope

- [ ] Product/UI
- [ ] API
- [ ] Database/migration
- [ ] GPT import schema
- [ ] Context memory
- [ ] Scripts/deployment
- [ ] Docs only

## Testing

- [ ] Lint passed
- [ ] Format check passed
- [ ] Typecheck passed
- [ ] Tests passed
- [ ] Build passed
- [ ] Payload examples validated
- [ ] Manual UI check done

## Screenshots

Add screenshots for UI changes.

## Migration notes

Does this include database migrations? If yes, explain.

## Deployment notes

Any production steps required?

## Rollback notes

How can this be reverted safely?

## Checklist

- [ ] No secrets committed
- [ ] Docs updated if behavior changed
- [ ] Logs do not expose sensitive data
- [ ] GPT payload schemas updated if needed
