# References

## Tools this system is built on
- Playwright MCP: introduction and tool list: https://playwright.dev/mcp/introduction
- Playwright MCP: configuration options: https://playwright.dev/mcp/configuration/options
- Playwright MCP: storage and authentication: https://playwright.dev/mcp/tools/storage
- Playwright Test Agents (planner / generator / healer): https://playwright.dev/docs/test-agents
- Playwright: locators: https://playwright.dev/docs/locators
- Playwright: best practices: https://playwright.dev/docs/best-practices
- Playwright: authentication and storage state: https://playwright.dev/docs/auth
- Playwright: parameterized tests (one test per row of data): https://playwright.dev/docs/test-parameterize
- Playwright: annotations and tags (`meta()` builds these): https://playwright.dev/docs/test-annotations
- Playwright: JSON reporter (what `ledger.mjs ingest` reads): https://playwright.dev/docs/test-reporters
- Playwright: project-level `grep` / `grepInvert` (feature selection, redundant rows): https://playwright.dev/docs/api/class-testproject
- Playwright: `testInfo.annotations`, `test.step` (what `proves()` uses): https://playwright.dev/docs/api/class-testinfo
- VS Code: custom agents: https://code.visualstudio.com/docs/agent-customization/custom-agents
- VS Code: custom agent file reference (frontmatter, handoffs, `agents`, MCP tool refs): https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference
- GitHub Docs: creating custom agents: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents

## Appian (the platform under test)
- Testing applications (supported UI test tools, test cases): https://docs.appian.com/suite/help/26.1/testing-applications.html
- Appian Dev MCP + SAIL CLI: https://docs.appian.com/suite/help/26.10/devmcp.html
- Appian Dev MCP (read-only) listing: https://appmarket.appian.com/listings/appian-dev-mcp-read-only
- Appian Selenium API (open source): https://gitlab.com/appian-oss/appian-selenium-api
- appian-locust (SAIL-level interactions, testLabel): https://appian-locust.readthedocs.io/en/stable/_api/modules/uiform.html
- Function and component versions (`_XXrX` suffixes): https://docs.appian.com/suite/help/25.4/function_versions.html
- Button component: https://docs.appian.com/suite/help/25.4/Button_Component.html
- Dropdown component: https://docs.appian.com/suite/help/25.4/Dropdown_Component.html
- Record action component: https://docs.appian.com/suite/help/24.2/Record_Action_Component.html
- Record action security: https://docs.appian.com/suite/help/26.6/record-action-security.html
- Section layout: https://docs.appian.com/suite/help/25.4/Section_Layout.html
- Async loading (25.3+): https://docs.appian.com/suite/help/25.4/async_loading.html
- 25.3 release notes: https://docs.appian.com/suite/help/25.3/Appian_Release_Notes.html
- Translation sets / `translation!`: https://docs.appian.com/suite/help/26.9/reference-translation-strings.html
- Internationalization (supported locales, incl. Greek): https://docs.appian.com/suite/help/25.4/admin-internationalization.html
- URLs for records / sites: https://docs.appian.com/suite/help/25.4/fnc_scripting_urlforrecord.html · https://docs.appian.com/suite/help/26.3/fnc_scripting_urlforsite.html
- Site object (pages, page groups, visibility): https://docs.appian.com/suite/help/26.3/sites_object.html
- Activity chaining: https://docs.appian.com/suite/help/26.9/Process_Model_Recipes.html
- Deployment guidelines (what an export contains): https://docs.appian.com/suite/help/25.4/Application_Deployment_Guidelines.html
- Inspection results (missing precedents): https://docs.appian.com/suite/help/24.4/Get_Inspection_Results_API.html
- Referencing objects (`rule!`, `cons!`, `recordType!`, `site!`, `translation!`): https://docs.appian.com/suite/help/26.3/reference-objects.html
- Expression rule test cases: https://docs.appian.com/suite/help/23.1/Expression_Rules.html
- Component plug-ins run in iframes: https://docs.appian.com/suite/help/26.8/component-security-performance.html
- Community: buttons always uppercase: https://community.appian.com/discussions/f/general/13841/buttonwidget/62838
- Community: Greek date field format: https://community.appian.com/discussions/f/new-to-appian/39185/format-of-a-datefield
- Dev MCP field method (persona discipline, readback): https://github.com/sthorn124/starwood-fund-ops
- **A real, public Appian application export under version control** (unzipped: content/, recordType/, processModel/, group/, datatype/, META-INF/, patches.xml, import customization file): https://github.com/o-guseva/appian-api

## Test design behind families and rows
- Equivalence partitioning and boundary value analysis: ISTQB Certified Tester Foundation Level syllabus, test techniques chapter (one test per partition; values on both sides of each edge).
- Test-suite minimisation (drop tests whose coverage another test already gives): S. Yoo and M. Harman, "Regression testing minimization, selection and prioritization: a survey", *Software Testing, Verification and Reliability* 22(2), 2012.

## Related research (code-guided GUI exploration)
- LLMVue: page transition graph extracted from Vue.js source guides GUI exploration: https://arxiv.org/abs/2606.27665
- Temac: broad exploration first, then LLM agents target uncovered functionality: https://arxiv.org/html/2506.00520v1
- ScenGen: scenario-driven multi-agent GUI testing: https://arxiv.org/html/2506.05079v1
- VLM-Fuzz: static analysis + VLM-guided DFS exploration (Android): https://arxiv.org/abs/2504.11675
