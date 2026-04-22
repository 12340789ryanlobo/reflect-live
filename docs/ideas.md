# Working Ideas + Pending Updates

## Aryan
1) Probably need to update codebase to support multiple organizations
2) Automatic flagging for concerning responses
3) Coach customization (e.g., questions to be asked, escalation rules)
    - low priority
4) Need to scale to multiple organizations (without data leakage)
5) Team/Organization dashboard





## Emil






## Lobo
fitness tracking: after sending session, ask changeable questions (# pullups, squat weight, clean weight) -> if didn't do it, 0.



are we able to keep track of who has and hasn't been setup on the app?


can we make heatmap so that it reacts to how many reports there are (for example if we hardcode No reports, 1-2 reports, 3-4 reports, 5+ reports, then larger teams might have red all over. we want it to be showing more affected areas based on how many are being reported. need to do this smartly. because might hide info of having more injuries at a time if just end up making it based on count of injuries. so want to make sure it's represented well + across all dates (7 days, 14 days, etc.))


got to change active flags pipeline - sometimes giving old info (e.g. readiness is currently much better for a specific athlete, but it is still flagging it from a couple days ago)


1) some way to integrate trainers into adding player info they have for individual players
    coach's feedback -> need to somehow encourage athletes to actually go see the trainers after recording an injury -> and keep pushing until they do or until they get better. 



3) HumanBehaviour - session replays (TALK TO CHIRAG)

    # Personal needs for swim coach
        Add coaches questions
        EoW summary printout (for meetings)
        
        possible swim session inputting (so the database has it and sees volume, time cycles, etc.)

        if swimmers list injury, keep following up until they have 1. seen the trainer (repeat after next swim session), 2. are not injured anymore

    # Personal needs for Rowing
        Implement times collection and storage (2k test erg times, etc.)

5) Note from Jack: rowing teams in UK colleges




***Coach's Interface***
possible table overwriteability..?

can read in emails/inputs to auto schedule
can read files to input sessions alongside database (helps better inform AI assistant)
sessions page
    allows coach to input session



whole pipeline currently feels a little too fragile - when changing template, have to change table's column headers + graph legend too - little too much
    also dont know how continuous the informaiton would be over different template changes



1. 
scheduling page
    less friction, change user journey

templates page
    less friction, change user journey


2. 
should keep consistency across pages
(the return to dashboard link is different on each of them, some is a rectangle button, others just looks like a link) -> how should we keep consistent amongst all

events page
    Adding event should be a pop up, rather than just static there the way it is right now.




AI assistant page
17) AI Assistant has different example prompted questions (change 'match' to 'competition')




***Player's Interface***
Player view - personally uploaded photos?




***Captain's interface***
how is "Open Flags" working - might be inflating numbers







99) Events page (coach can upload information - film, times, etc.)




## Lucas





