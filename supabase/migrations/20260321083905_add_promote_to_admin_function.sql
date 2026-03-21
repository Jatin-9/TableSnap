/*
  # Helper Function to Promote User to Super Admin

  ## Overview
  Adds a helper function to easily promote users to super admin role.

  ## Functions
  1. `promote_to_super_admin(user_email text)` - Promotes a user to super admin by email
  
  ## Usage
  ```sql
  SELECT promote_to_super_admin('user@example.com');
  ```

  ## Security
  This function should only be called by database administrators.
*/

-- Function to promote a user to super admin
CREATE OR REPLACE FUNCTION promote_to_super_admin(user_email text)
RETURNS boolean AS $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE users
  SET role = 'super_admin'
  WHERE email = user_email;
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  
  IF rows_updated > 0 THEN
    RETURN true;
  ELSE
    RAISE NOTICE 'No user found with email: %', user_email;
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to demote a super admin back to regular user
CREATE OR REPLACE FUNCTION demote_from_super_admin(user_email text)
RETURNS boolean AS $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE users
  SET role = 'user'
  WHERE email = user_email;
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  
  IF rows_updated > 0 THEN
    RETURN true;
  ELSE
    RAISE NOTICE 'No user found with email: %', user_email;
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
