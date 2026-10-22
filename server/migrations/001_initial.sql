-- MySQL 8：正式适配器的结构基线，当前文件存储不会执行此文件。
CREATE TABLE players (
  player_id CHAR(48) CHARACTER SET ascii PRIMARY KEY,
  token_sha256 BINARY(32) NOT NULL UNIQUE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE game_states (
  player_id CHAR(48) CHARACTER SET ascii PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  schema_version INT UNSIGNED NOT NULL,
  content_version VARCHAR(64) NOT NULL,
  state_json JSON NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_state_player FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

CREATE TABLE command_receipts (
  player_id CHAR(48) CHARACTER SET ascii NOT NULL,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_sha256 BINARY(32) NOT NULL,
  response_json JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (player_id, idempotency_key),
  INDEX ix_receipts_created (created_at),
  CONSTRAINT fk_receipt_player FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;
