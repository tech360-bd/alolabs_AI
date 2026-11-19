import test from 'node:test';
import assert from 'node:assert/strict';
import {compatible} from '../../deploy/scripts/lib/review-migrations.mjs';
test('reviewed nullable additions are eligible',()=>assert.equal(compatible('ALTER TABLE `User` ADD COLUMN `note` VARCHAR(40) NULL;'),true));
test('other DDL and mixed statements always require separate review',()=>{for(const s of ['', 'ALTER TABLE `User` ADD COLUMN `note` INT NOT NULL;', 'ALTER TABLE `User` ADD COLUMN `note` TEXT NULL; DELETE FROM `User`;', 'ALTER TABLE `User` DROP COLUMN `note`'])assert.equal(compatible(s),false);});
