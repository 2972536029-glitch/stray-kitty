-- The complete player aggregate preserves gameplay, command receipts and QA
-- backups atomically. Session/account indexes provide direct identity lookup.
CREATE TABLE IF NOT EXISTS game_players (
  player_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  primary_hash VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  player_json JSON NOT NULL,
  is_qa BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_sessions (
  token_hash VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  player_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  INDEX ix_game_sessions_player (player_id),
  CONSTRAINT fk_game_session_player FOREIGN KEY (player_id) REFERENCES game_players(player_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_accounts (
  username VARBINARY(384) PRIMARY KEY,
  player_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  password_hash VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  password_salt VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_game_account_player FOREIGN KEY (player_id) REFERENCES game_players(player_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_store_meta (
  id INT PRIMARY KEY,
  imported BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;
INSERT IGNORE INTO game_store_meta (id, imported) VALUES (1, FALSE);

CREATE TABLE IF NOT EXISTS payment_transactions (
  sequence_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  txn_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  player_id VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  txn_json JSON NOT NULL,
  INDEX ix_payment_player_sequence (player_id, sequence_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_ledger_meta (
  id INT PRIMARY KEY,
  imported BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;
INSERT IGNORE INTO payment_ledger_meta (id, imported) VALUES (1, FALSE);
