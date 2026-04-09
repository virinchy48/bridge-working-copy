Feature: Bridge Access Control
  As a System Administrator
  I want role-based access control enforced on bridge operations
  So that only authorised users can modify bridge data

  Scenario Outline: Role-based action enforcement
    Given I am authenticated as "<role>"
    And a bridge "BRG-RBAC" exists
    When I attempt to "<action>" the bridge
    Then the result is <result>

    Examples:
      | role           | action           | result   |
      | Admin          | closeForTraffic  | allowed  |
      | BridgeManager  | closeForTraffic  | allowed  |
      | Inspector      | closeForTraffic  | allowed  |
      | Viewer         | closeForTraffic  | denied   |
      | Admin          | closeBridge      | allowed  |
      | BridgeManager  | closeBridge      | allowed  |
      | Viewer         | closeBridge      | denied   |
      | Admin          | addRestriction   | allowed  |
      | BridgeManager  | addRestriction   | allowed  |
      | Viewer         | addRestriction   | denied   |

  Scenario: Viewer sees masked condition data
    Given I am authenticated as a Viewer
    When I read bridge "BRG-RBAC" details
    Then conditionRating is null
    And conditionScore is null

  Scenario: Admin sees full condition data
    Given I am authenticated as an Admin
    When I read bridge "BRG-RBAC" details
    Then conditionRating is visible
    And conditionScore is visible

  Scenario: Tenant code resolved from JWT only
    Given a request with x-tenant-code header set to "ATTACKER_TENANT"
    When the system resolves the tenant code
    Then the tenant code is "NHVR_NATIONAL"
    And the x-tenant-code header is ignored
