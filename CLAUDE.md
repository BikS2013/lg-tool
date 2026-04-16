<structure-and-conventions>
## Structure & Conventions

- Every time you want to create a test script, you must create it in the test_scripts folder. If the folder doesn't exist, you must make it.

- All the plans must be kept under the docs/design folder inside the project's folder in separate files: Each plan file must be named according to the following pattern: plan-xxx-<indicative description>.md

- The complete project design must be maintained inside a file named docs/design/project-design.md under the project's folder. The file must be updated with each new design or design change.

- All the reference material used for the project must be collected and kept under the docs/reference folder.
- All the functional requirements and all the feature descriptions must be registered in the /docs/design/project-functions.MD document under the project's folder.

<configuration-guide>
- If the user ask you to create a configuration guide, you must create it under the docs/design folder, name it configuration-guide.md and be sure to explain the following:
  - if multiple configuration options exist (like config file, env variables, cli params, etc) you must explain the options and what is the priority of each one.
  - Which is the purpose and the use of each configuration variable
  - How the user can obtain such a configuration variable
  - What is the recomented approach of storing or managing this configuration variable
  - Which options exist for the variable and what each option means for the project
  - If there are any default value for the parameter you must present it.
  - For configuration parameters that expire (e.g., PAT keys, tokens), I want you to propose to the user adding a parameter to capture the parameter's expiration date, so the app or service can proactively warn users to renew.
</configuration-guide>

- Every time you create a prompt working in a project, the prompt must be placed inside a dedicated folder named prompts. If the folder doesn't exists you must create it. The prompt file name must have an sequential number prefix and must be representative to the prompt use and purpose.

- You must maintain a document at the root level of the project, named "Issues - Pending Items.md," where you must register any issue, pending item, inconsistency, or discrepancy you detect. Every time you fix a defect or an issue, you must check this file to see if there is an item to remove.
- The "Issues - Pending Items.md" content must be organized with the pending items on top and the completed items after. From the pending items the most critical and important must be first followed by the rest.

- When I ask you to create tools in the context of a project everything must be in Typescript.
- Every tool you develop must be documented in the project's Claude.md file
- The documentation must be in the following format:
<toolName>
    <objective>
        what the tool does
    </objective>
    <command>
        the exact command to run
    </command>
    <info>
        detailed description of the tool
        command line parameters and their description
        examples of usage
    </info>
</toolName>

- Every time I ask you to do something that requires the creation of a code script, I want you to examine the tools already implemented in the scope of the project to detect if the code you plan to write, fits to the scope of the tool.
- If so, I want you to implement the code as an extension of the tool, otherwise I want you to build a generic and abstract version of the code as a tool, which will be part of the toolset of the project.
- Our goal is, while the project progressing, to develop the tools needed to test, evaluate, generate data, collect information, etc and reuse them in a consistent manner.
- All these tools must be documented inside the CLAUDE.md to allow their consistent reuse.

- When I ask you to locate code, I need to give me the folder, the file name, the class, and the line number together with the code extract.
- Don't perform any version control operation unless I explicitly request it.

- When you design databases you must align with the following table naming conventions:
  - Table names must be singular e.g. the table that keeps customers' data must be called "Customer"
  - Tables that are used to express references from one entity to another can by plural if the first entity is linked to many other entities.
  - So we have "Customer" and "Transaction" tables, we have CustomerTransactions.

- You must never create fallback solutions for configuration settings. In every case a configuration setting is not provided you must raise the appropriate exception. You must never substitute the missing config value with a default or a fallback value.
- If I ask you to make an exception to the configuration setting rule, you must write this exception in the projects memory file, before you implement it.
</structure-and-conventions>

# lg-tool

## Project Overview
A TypeScript CLI tool for interacting with LangGraph servers and inspecting their underlying PostgreSQL data.

## Tools

<LgTool>
    <objective>
        CLI tool that provides five operations against a LangGraph deployment: listing agents, creating threads, sending requests to agents, extracting all thread-related data from the backing PostgreSQL database, and identifying the documents used in a thread's RAG pipeline.
    </objective>
    <command>
        npx tsx src/cli.ts [command] [options]
    </command>
    <info>
        lg-tool is a TypeScript CLI tool that interacts with LangGraph servers
        via REST API and directly queries the backing PostgreSQL database for deep inspection
        of agent execution data.

        Commands:
            agents                                List all available agents/assistants
            thread-create [--metadata <json>]     Create a new thread
            run --thread <id> --assistant <id> --message <text>  Send a request to an agent
            extract --thread <id> [--output <file>] [--include-blobs]  Extract all thread data from PostgreSQL
            documents --thread <id> [--output <file>]  Extract retrieved documents used in a thread

        Environment Variables (required, no defaults):
            LANGGRAPH_SERVER_URL     Base URL of the LangGraph server
            LANGGRAPH_POSTGRES_URL   PostgreSQL connection string for the LangGraph database

        Configuration priority (highest to lowest):
            1. Shell environment variables
            2. .env file in current working directory
            3. ~/.lg-tool/.env

        Build:
            npx tsc                    # Compile to dist/
            npx tsc --noEmit           # Type check only

        Development:
            npx tsx src/cli.ts [command]

        Tests:
            npx tsx test_scripts/test-config.ts      # Config module tests (5 test cases)
            npx tsx test_scripts/test-utils.ts       # Utils and formatters tests (8 test cases)
            npx tsx test_scripts/test-documents.ts   # documents-command unit tests (2 test cases, no DB)
            npx tsx test_scripts/test-e2e.ts         # End-to-end test against live server (11 assertions)
              # test-e2e.ts requires, in addition to LANGGRAPH_SERVER_URL and
              # LANGGRAPH_POSTGRES_URL: LANGGRAPH_TEST_ASSISTANT_ID (UUID of a
              # known assistant deployed on the server).
              # Note: test-config.ts and test-documents.ts set "missing" env vars
              # to '' (empty string) rather than undefined, so dotenv.config() in
              # src/config.ts does not silently re-populate them from a CWD .env.

        Examples:
            # List agents
            LANGGRAPH_SERVER_URL=https://my-server.azurewebsites.net npx tsx src/cli.ts agents

            # Create a thread
            npx tsx src/cli.ts thread-create --metadata '{"purpose": "testing"}'

            # Send a message to an agent
            npx tsx src/cli.ts run --thread <uuid> --assistant <uuid> --message "Hello"

            # Extract all thread data from PostgreSQL
            npx tsx src/cli.ts extract --thread <uuid> --output extraction.json

            # Extract with binary blob data included
            npx tsx src/cli.ts extract --thread <uuid> --include-blobs

            # List documents retrieved during a thread's RAG pipeline
            lg-tool documents --thread <uuid>

            # Export documents to JSON
            lg-tool documents --thread <uuid> --output docs.json

        Prerequisites:
            Node.js >= 18
            npm install (to install dependencies: pg, commander, dotenv)
    </info>
</LgTool>
