Feature: Bridge Lifecycle Management
  As a Bridge Manager
  I want to create, update, and manage bridge records
  So that the national bridge asset registry is accurate and current

  Background:
    Given I am authenticated as a Bridge Manager
    And the bridge registry is available

  Scenario: Create a new bridge with mandatory fields
    When I submit a new bridge with:
      | bridgeId | name              | state | latitude | longitude | assetOwner         |
      | BRG-NEW  | Test Creek Bridge | NSW   | -33.87   | 151.21    | Transport for NSW  |
    Then the bridge is created successfully with HTTP 201
    And the bridge has posting status "UNRESTRICTED"
    And the bridge has condition "GOOD"
    And an audit log entry exists for "CREATE" on "BRG-NEW"

  Scenario: Reject bridge with duplicate Bridge ID
    Given a bridge with bridgeId "BRG-DUP" already exists
    When I submit a new bridge with bridgeId "BRG-DUP"
    Then the request is rejected with HTTP 400
    And the error message contains "already exists"

  Scenario: Reject bridge with missing name
    When I submit a new bridge with:
      | bridgeId | name | state | latitude | longitude | assetOwner |
      | BRG-NONAME |    | NSW   | -33.87   | 151.21    | TfNSW      |
    Then the request is rejected
    And the error message contains "name"

  Scenario Outline: Validate coordinate boundaries
    When I submit a bridge with latitude <lat> and longitude <lon>
    Then the result is <result>

    Examples:
      | lat    | lon     | result   |
      | -33.87 | 151.21  | accepted |
      | -90    | -180    | accepted |
      | 90     | 180     | accepted |
      | -91    | 151.21  | rejected |
      | -33.87 | 181     | rejected |

  Scenario Outline: Validate condition rating auto-derives condition label
    When I create a bridge with conditionRating <rating>
    Then the bridge condition is "<label>"

    Examples:
      | rating | label     |
      | 10     | EXCELLENT |
      | 9      | VERY_GOOD |
      | 7      | GOOD      |
      | 5      | FAIR      |
      | 3      | POOR      |
      | 1      | FAILED    |

  Scenario: Close bridge for traffic
    Given a bridge "BRG-CLOSE" exists with posting status "UNRESTRICTED"
    When I close the bridge for traffic
    Then the bridge posting status is "CLOSED"
    And an audit log entry exists for "closeForTraffic"

  Scenario: Reopen bridge with no active restrictions
    Given a bridge "BRG-REOPEN" exists with posting status "CLOSED"
    And no active restrictions exist on this bridge
    When I reopen the bridge for traffic
    Then the bridge posting status is "UNRESTRICTED"

  Scenario: Reopen bridge with active restrictions sets POSTED
    Given a bridge "BRG-POSTED" exists with posting status "CLOSED"
    And an active WEIGHT restriction exists on this bridge
    When I reopen the bridge for traffic
    Then the bridge posting status is "POSTED"

  Scenario: Viewer cannot close a bridge
    Given I am authenticated as a Viewer
    And a bridge "BRG-VIEW" exists
    When I attempt to close the bridge for traffic
    Then the request is rejected with HTTP 403

  Scenario: Change bridge condition with history tracking
    Given a bridge "BRG-COND" exists with condition "GOOD"
    When I change the condition to "POOR" with score 30
    Then the bridge condition is "POOR"
    And a condition history entry is created
    And the history shows old condition "GOOD" and new condition "POOR"
