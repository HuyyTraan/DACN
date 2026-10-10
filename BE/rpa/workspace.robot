*** Settings ***
Library    SeleniumLibrary
Suite Teardown    Close All Browsers

*** Variables ***
${BASE_URL}    http://localhost:3000
${BROWSER}    chrome

*** Test Cases ***
Open Marketing Workspace
    Open Browser    ${BASE_URL}    ${BROWSER}
    Wait Until Page Contains    Omni Workspace    15s
    Page Should Contain    Tổng quan
    Click Link    css:a[href="#campaigns"]
    Wait Until Page Contains    Danh sách chiến dịch    10s
    Page Should Contain    Chạm mùa thu
