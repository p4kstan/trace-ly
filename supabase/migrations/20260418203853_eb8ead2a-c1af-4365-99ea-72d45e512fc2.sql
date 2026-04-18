UPDATE integration_destinations
SET config_json = jsonb_set(config_json, '{developer_token}', '"oJ8HnqIdsbMsYIWxM7GPkA"'::jsonb)
WHERE id = '7f6a7ac8-dd1b-47da-bd4a-93f3e8b83819';