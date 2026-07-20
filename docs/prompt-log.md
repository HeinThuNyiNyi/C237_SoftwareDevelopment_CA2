# Prompt Log (for reflection)

Chronological record of the prompts given to Claude Code during this session, working on the CampusCycle CA2 project. This only covers the current session's conversation — Claude does not have access to prior separate sessions unless they're pasted in.

1. Can you pull from all branches merge it. but don't touch the individual routes if there is any conflict tell me first
2. (clarification) As long as don't change the route position it is fine
3. (clarification) Keep mine, add Kaiduo's new routes only
4. What is the different between recently listed and browse page
5. Delete that page it should be browse page which will display alll items after log in
6. (clarification) Homepage → redirects to Browse; keep Browse public
7. Change the owner from the database to test it out like. I would be able to reserve June's product. Currently all products are Thiha Aung ownership
8. (clarification) Yes, don't change the code line only data
9. Clear up all the products with no image also
10. (clarification) Yes, delete both
11. I want to create a new branch called Test and commit to github. I want to type manually what are the codes.
12. I mean all files not just image folder
13. (pasted `git add .` error output) Only why this — I want all
14. No, only push to Test branch, I don't want to touch my own branch now
15. Is it include all this code?
16. Noooo Thiha_Aung branch does not have that one
17. Put the profile button back and view the profile detail
18. Put the profile button in browse page
19. Recently I deleted the home.ejs right?
20. In the index.ejs there are a lot of navbar connected to individual page — can you put it again linking to their individual pages
21. Pushed the changes into Test branch
22. Can you delete all users and put 2 admin and 6 users (which is our name) with @myrp.edu.sg — you can use all password the same
23. (clarification) Yes delete but create 2 or 3 sample data using image folder again; Password@123 / Admin One, Admin Two
24. What are the password
25. Why I cannot add product.
26. Firstly can you delete the browse button — we already have home page button, and also make navbar buttons in dropdown with the innovative and creative box
27. (clarification) Delete the browse button, leave the home page; collapse everything into one menu button
28. Can you merge with Test branch rn for report function (interrupted/withdrawn)
29. Don't change anything for the rest
30. Can you delete "my listings" in dropdown menu and connect sales history and purchase history. Create the new pages to show the user's purchases and sold out products
31. All go under Thiha Aung (routes should live under "Thiha Aung's routes" section)
32. Reserved item should be appeared in purchase history page — but it is only the purchase done by the user account not for the other account purchases, same for sales history
33. (clarification) No, only show completed purchases
34. Navbar is too small for this and sold out things should not be appeared in the browse page
35. (clarification) Adjust the search bar, it is small for this, and category also
36. In the sale history show all the selling products by the user with status of pending for admin approval, selling, reserved already. And put the filter also, it is for the Sales history. And when user click the view profile in browse page, it will show all selling products by the seller.
37. All go under Thiha Aung
38. User can also edit and delete their post in the selling which is selling.
39. Ok create the UI UX better, there is some consistency error and the bg is too many white space, change this
40. Do not overwrite any code? (concern about running a screenshot script)
41. What is for screenshot
42. Oh show me first
43. No need to show listings we already have status
44. I mean text
45. (clarification) Simple, status-agnostic message
46. (pasted screenshot of Sell page) Why the add product form is like that
47. Ok done
48. Save all prompt for all session for reflection later, just save it, anyone don't need to give it

## Notable feedback / preferences observed
- Wants destructive/DB actions (deletes, wipes) confirmed before running.
- Wants new product-related routes placed under the "Thiha Aung's routes" section in `app.js`.
- Prefers to type git commands manually rather than have them run automatically, when asked.
- Prefers simple/concise UI text over verbose per-case explanations.
- Sensitive about scripts that could be perceived as touching/overwriting code — prefers a clear explanation of what a script does (read-only vs. writing) before running it.
