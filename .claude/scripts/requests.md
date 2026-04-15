 /team-workflow

I want you to study the langgraph server spec
I want you to use it,
to create a tool that will make the following operations:
- it will ask the server to get the availble agents,
- it will start a new thread on the server,
- It will make a request in the context of a specific thread targeting a pecific agent,
- It will connect  to the PostgreSql database used by the langgraph to xtract all the data related to the
specific thread (including thread entries, runs, checkpoints and documents)

I want you to use the langgraph server at
my-secret-url-1
and the PostgreSql URL
my-secret-url-2

to cross check and validate the tools

----


I want you to make it direct command (lagent-cli)
and allow the two variables to be used through the .env file (or system environment variables)

----

I want you to use the tool
to create a thread
and ask the agent
"πόσα απίδια πβάζει ο σάκος ?"

----

I want you to enhance the tool to retrieve from the database the data related to the particular thread
and extract the data identifying the documents used in this thread

----
