Feature: Restriction Management
  As a Bridge Manager
  I want to create, validate, and manage bridge restrictions
  So that heavy vehicle access is properly controlled

  Background:
    Given I am authenticated as a Bridge Manager
    And a bridge "BRG-REST" exists in the registry

  Scenario: Add a WEIGHT restriction to a bridge
    When I add a restriction with:
      | restrictionType | value | unit   | status |
      | WEIGHT          | 42.5  | t      | ACTIVE |
    Then the restriction is created successfully
    And the bridge posting status changes to "POSTED"

  Scenario: Reject restriction with value <= 0
    When I add a restriction with type "WEIGHT" and value 0
    Then the request is rejected
    And the error message contains "greater than 0"

  Scenario: Allow VEHICLE_TYPE with zero value
    When I add a restriction with type "VEHICLE_TYPE" and value 0
    Then the restriction is created successfully

  Scenario: Reject restriction without bridge or route
    When I submit a restriction without a bridge or route association
    Then the request is rejected
    And the error message contains "Bridge or a Route"

  Scenario Outline: Validate unit matches restriction type
    When I add a restriction with type "<type>" and unit "<unit>"
    Then the result is <result>

    Examples:
      | type   | unit | result   |
      | HEIGHT | m    | accepted |
      | HEIGHT | t    | rejected |
      | MASS   | t    | accepted |
      | SPEED  | km/h | accepted |
      | SPEED  | t    | rejected |

  Scenario: Reject date range where From > To
    When I add a restriction with validFromDate "2026-12-31" and validToDate "2026-01-01"
    Then the request is rejected
    And the error message contains "before Valid To Date"

  Scenario: Temporary restriction requires reason
    When I add a temporary restriction without a reason
    Then the request is rejected
    And the error message contains "reason"

  Scenario Outline: Validate restriction type enum
    When I add a restriction with type "<type>"
    Then the result is <result>

    Examples:
      | type          | result   |
      | MASS          | accepted |
      | GROSS_MASS    | accepted |
      | HEIGHT        | accepted |
      | WIDTH         | accepted |
      | SPEED         | accepted |
      | INVALID_TYPE  | rejected |

  Scenario: Gazette reference format validation
    When I add a restriction with gazetteRef "NSW-2026/001"
    Then the gazette validation status is "VALID" or "NOT_FOUND"

  Scenario: Invalid gazette format sets INVALID_FORMAT
    When I add a restriction with gazetteRef "bad-ref"
    Then the gazette validation status is "INVALID_FORMAT"
